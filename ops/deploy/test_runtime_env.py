"""No external services or real credentials are used in these deployment tests."""
import importlib.util
import json
import os
import re
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("runtime_env", Path(__file__).with_name("runtime_env.py"))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env = Path(self.directory.name) / ".env"
        self.env.write_text("DB_PASSWORD=keep-database-password\nDJANGO_SECRET_KEY=keep-django-key\nAPP_IMAGE=registry/app:old\n")

    def test_staging_source_exports_only_images_and_ocr_including_explicit_empty_keys(self):
        source = Path(self.directory.name) / ".env.generated"
        source.write_text("DB_PASSWORD=do-not-transfer\nBAZPOS_OCR_ENABLED=True\nBAZPOS_OCR_PROVIDER=gemini\nBAZPOS_OCR_GEMINI_API_KEY='fake-key'\nBAZPOS_OCR_OPENROUTER_API_KEY=\nAPP_IMAGE=registry/app:new\n")
        payload = Path(self.directory.name) / "payload.json"
        subprocess.run([sys.executable, str(Path(runtime.__file__)), "export", "--source", str(source), "--output", str(payload)], check=True)
        values = json.loads(payload.read_text())
        self.assertNotIn("DB_PASSWORD", values)
        self.assertEqual(values["BAZPOS_OCR_OPENROUTER_API_KEY"], "")
        runtime.apply_config(self.env, values)
        self.assertIn("DB_PASSWORD=keep-database-password", self.env.read_text())
        self.assertIn("DJANGO_SECRET_KEY=keep-django-key", self.env.read_text())
        self.assertEqual(runtime.read_values(self.env.read_text())["APP_IMAGE"], "registry/app:new")
        self.assertEqual(payload.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.env.stat().st_mode & 0o777, 0o600)

    def test_unconfigured_actions_variables_preserve_remote_ocr_configuration(self):
        self.env.write_text(self.env.read_text() + "BAZPOS_OCR_ENABLED=True\nBAZPOS_OCR_PROVIDER=gemini\nBAZPOS_OCR_GEMINI_API_KEY=remote-secret\n")
        payload = Path(self.directory.name) / "actions.json"
        environment = {**os.environ, **{key: "" for key in runtime.KEYS}, "APP_IMAGE": "registry/app:new"}
        subprocess.run([sys.executable, str(Path(runtime.__file__)), "export", "--environment", "--output", str(payload)], env=environment, check=True)
        runtime.apply_config(self.env, json.loads(payload.read_text()))
        values = runtime.read_values(self.env.read_text())
        self.assertEqual(values["BAZPOS_OCR_GEMINI_API_KEY"], "remote-secret")
        self.assertEqual(values["BAZPOS_OCR_ENABLED"], "True")
        self.assertEqual(values["APP_IMAGE"], "registry/app:new")

    def test_unsafe_secret_characters_round_trip_without_shell_execution(self):
        secret = "fake-$HOME-$(touch /tmp/do-not-create)-'quoted'-\\slash # hash"
        values = {"BAZPOS_OCR_ENABLED": "True", "BAZPOS_OCR_PROVIDER": "gemini", "BAZPOS_OCR_GEMINI_API_KEY": secret}
        runtime.apply_config(self.env, values)
        self.assertEqual(runtime.read_values(self.env.read_text())["BAZPOS_OCR_GEMINI_API_KEY"], secret)
        first = self.env.read_bytes()
        runtime.apply_config(self.env, values)
        self.assertEqual(self.env.read_bytes(), first)

    def test_invalid_configuration_does_not_modify_existing_env(self):
        previous = self.env.read_bytes()
        for updates in ({"DB_PASSWORD": "forbidden"}, {"BAZPOS_OCR_ENABLED": "True", "BAZPOS_OCR_PROVIDER": "gemini"},
                        {"BAZPOS_OCR_ENABLED": "True", "BAZPOS_OCR_PROVIDER": "gemini", "BAZPOS_OCR_GEMINI_API_KEY": "fake", "BAZPOS_OCR_MODEL": "google/gemini-test"},
                        {"BAZPOS_OCR_ENABLED": "True", "BAZPOS_OCR_OPENROUTER_API_KEY": "fake", "BAZPOS_OCR_MODEL": "gemini-test"},
                        {"BAZPOS_OCR_ENABLED": "yes"}, {"BAZPOS_OCR_GEMINI_API_KEY": "line1\nline2"}, {"APP_IMAGE": 123}):
            with self.assertRaises(runtime.ConfigError):
                runtime.apply_config(self.env, updates)
            self.assertEqual(self.env.read_bytes(), previous)

    def test_explicit_disable_does_not_require_a_key(self):
        runtime.apply_config(self.env, {"BAZPOS_OCR_ENABLED": "False"})
        self.assertEqual(runtime.read_values(self.env.read_text())["BAZPOS_OCR_ENABLED"], "False")

    def test_duplicate_assignments_are_replaced_once(self):
        self.env.write_text(self.env.read_text() + "BAZPOS_OCR_MODEL=old\nBAZPOS_OCR_MODEL=older\n")
        runtime.apply_config(self.env, {"BAZPOS_OCR_MODEL": "new"})
        self.assertEqual(self.env.read_text().count("BAZPOS_OCR_MODEL="), 1)
        self.assertEqual(runtime.read_values(self.env.read_text())["BAZPOS_OCR_MODEL"], "new")

    def test_legacy_openrouter_key_follows_django_fallback_precedence(self):
        self.env.write_text(self.env.read_text() + "BAZPOS_LLM_API_KEY=legacy-key\n")
        runtime.apply_config(self.env, {"BAZPOS_OCR_ENABLED": "True"})
        with self.assertRaises(runtime.ConfigError):
            runtime.apply_config(self.env, {"BAZPOS_OCR_OPENROUTER_API_KEY": ""})

    def test_staging_sync_script_transports_secrets_and_preserves_db_credentials(self):
        root = Path(__file__).resolve().parents[2]
        directory = Path(self.directory.name)
        remote = directory / "remote"
        remote.mkdir()
        (remote / ".env").write_text("DB_PASSWORD=remote-only-password\nAPP_IMAGE=old-image\n")
        source = directory / ".env.generated"
        source.write_text("DB_PASSWORD=local-do-not-copy\nBAZPOS_OCR_ENABLED=True\nBAZPOS_OCR_PROVIDER=gemini\nBAZPOS_OCR_GEMINI_API_KEY=private-test-key\nAPP_IMAGE=registry/app:new\n")
        binaries = directory / "bin"
        binaries.mkdir()
        (binaries / "ssh").write_text("#!/usr/bin/env bash\nset -euo pipefail\ncommand=\"${!#}\"\nbash -c \"$command\"\n")
        (binaries / "rsync").write_text("#!/usr/bin/env python3\nimport sys,shutil\nfrom pathlib import Path\ndest=Path(sys.argv[-1].split(':',1)[1])\nfor source in sys.argv[1:-1]:\n if not source.startswith('-'): shutil.copy2(source,dest/Path(source).name)\n")
        for binary in binaries.iterdir():
            binary.chmod(0o755)
        result = subprocess.run(["bash", str(root / "ops/staging/scripts/sync-runtime-config.sh")], env={
            **os.environ, "PATH": str(binaries) + os.pathsep + os.environ["PATH"], "LOCAL_ENV": str(source), "COMPOSE_DIR": str(remote),
        }, capture_output=True, text=True, check=True)
        self.assertNotIn("private-test-key", result.stdout + result.stderr)
        self.assertNotIn("local-do-not-copy", (remote / ".env").read_text())
        self.assertIn("DB_PASSWORD=remote-only-password", (remote / ".env").read_text())
        self.assertEqual(runtime.read_values((remote / ".env").read_text())["BAZPOS_OCR_GEMINI_API_KEY"], "private-test-key")
        self.assertFalse((remote / ".deploy/runtime-env.json").exists())
        self.assertEqual(runtime.read_values((remote / ".env").read_text())["APP_IMAGE"], "old-image")

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI no disponible")
    def test_compose_reads_quoted_secrets_literally_without_interpolation(self):
        directory = Path(self.directory.name)
        compose = directory / "compose.yaml"
        compose.write_text("services:\n  app:\n    image: busybox:latest\n    env_file: .env\n")
        secret = "fake-$HOME-$(noop)-'quote'-\\slash #literal"
        runtime.apply_config(self.env, {"BAZPOS_OCR_GEMINI_API_KEY": secret})
        result = subprocess.run(["docker", "compose", "-f", str(compose), "--env-file", str(self.env), "config", "--environment"], capture_output=True, text=True, check=True)
        value = next(line.split("=", 1)[1] for line in result.stdout.splitlines() if line.startswith("BAZPOS_OCR_GEMINI_API_KEY="))
        self.assertEqual(value, secret)

    @unittest.skipUnless(shutil.which("tar"), "tar no disponible")
    def test_deploy_archive_can_be_repeated_without_touching_mariadb_or_env(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / ".github/workflows/deploy.yml").read_text()
        sources = re.search(r'^\s+source: "([^"]+)"$', workflow, re.MULTILINE).group(1).split(",")
        directory = Path(self.directory.name)
        source = directory / "source"
        target = directory / "target"
        source.mkdir()
        target.mkdir()
        for name in sources:
            destination = source / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            if name == ".deploy/runtime-env.json":
                destination.write_text(json.dumps({"APP_IMAGE": "registry/app:new"}))
                destination.chmod(0o600)
            else:
                shutil.copy2(root / name, destination)
        # This directory reproduces the exact destination that made GNU tar fail.
        config_directory = target / "docker/mariadb/zz-bazpos-tuning.cnf"
        config_directory.mkdir(parents=True)
        marker = config_directory / "existing-config"
        marker.write_text("keep database configuration")
        env = target / ".env"
        env.write_text("DB_PASSWORD=do-not-change\n")
        archive = directory / "deploy.tar.gz"
        subprocess.run(["tar", "-zcf", str(archive), "-C", str(source), *sources], check=True)
        for _ in range(2):
            subprocess.run(["tar", "-zxf", str(archive), "-C", str(target)], capture_output=True, check=True)
            self.assertEqual(marker.read_text(), "keep database configuration")
            self.assertEqual(env.read_text(), "DB_PASSWORD=do-not-change\n")
            self.assertTrue((target / "ops/deploy/runtime_env.py").is_file())
            self.assertEqual((target / ".deploy/runtime-env.json").stat().st_mode & 0o777, 0o600)

    def test_invalid_json_cli_does_not_echo_secret_contents(self):
        payload = Path(self.directory.name) / "invalid.json"
        payload.write_text('{"BAZPOS_OCR_GEMINI_API_KEY": "private-test-secret"')
        result = subprocess.run([sys.executable, str(Path(runtime.__file__)), "apply", "--target", str(self.env), "--input", str(payload)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("private-test-secret", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
