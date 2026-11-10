#!/usr/bin/env python3
"""Transfer only image/OCR runtime settings. Never source or log a secret."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import tempfile

OCR_KEYS = (
    "BAZPOS_OCR_ENABLED", "BAZPOS_OCR_PROVIDER", "BAZPOS_OCR_MODEL",
    "BAZPOS_OCR_OPENROUTER_API_KEY", "BAZPOS_OCR_GEMINI_API_KEY", "BAZPOS_OCR_API_KEY",
)
KEYS = (*OCR_KEYS, "APP_IMAGE", "NGINX_IMAGE")
ASSIGNMENT = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=(.*)$")


class ConfigError(Exception):
    pass


def decode_value(raw):
    value = raw.strip()
    if not value:
        return ""
    if value[0] in "\"'":
        quote = value[0]
        output = []
        index = 1
        while index < len(value):
            char = value[index]
            if char == quote:
                trailing = value[index + 1:].strip()
                if trailing and not trailing.startswith("#"):
                    raise ConfigError("Valor dotenv con caracteres fuera de las comillas.")
                return "".join(output)
            if char == "\\" and index + 1 < len(value) and value[index + 1] in ((quote,) if quote == "'" else (quote, "\\")):
                index += 1
                char = value[index]
            output.append(char)
            index += 1
        raise ConfigError("Valor dotenv con comillas sin cerrar.")
    return re.split(r"\s+#", value, maxsplit=1)[0].rstrip()


def read_values(text, keys=KEYS):
    values = {}
    for line in text.splitlines():
        match = ASSIGNMENT.match(line)
        if match and match[1] in keys:
            values[match[1]] = decode_value(match[2])
    return values


def validate(values, existing):
    if not isinstance(values, dict) or set(values) - set(KEYS):
        raise ConfigError("El paquete de configuración contiene variables no permitidas.")
    for key, value in values.items():
        if not isinstance(value, str) or any(char in value for char in "\r\n\x00"):
            raise ConfigError(f"{key}: se requiere un valor de una sola línea.")
    merged = {**existing, **values}
    enabled = merged.get("BAZPOS_OCR_ENABLED", "False").lower()
    provider = merged.get("BAZPOS_OCR_PROVIDER", "openrouter").lower()
    if enabled not in ("true", "false", ""):
        raise ConfigError("BAZPOS_OCR_ENABLED debe ser True o False.")
    if enabled != "true":
        return
    if provider not in ("gemini", "openrouter"):
        raise ConfigError("BAZPOS_OCR_PROVIDER debe ser gemini u openrouter.")
    if provider == "gemini":
        key = merged.get("BAZPOS_OCR_GEMINI_API_KEY", "")
    else:
        key = merged.get("BAZPOS_OCR_OPENROUTER_API_KEY",
                         merged.get("BAZPOS_OCR_API_KEY", merged.get("BAZPOS_LLM_API_KEY", "")))
    if not key:
        raise ConfigError(f"OCR activado sin clave para {provider}; configuración no aplicada.")
    model = merged.get("BAZPOS_OCR_MODEL", "")
    if provider == "gemini" and model and not re.fullmatch(r"[a-zA-Z0-9._-]+", model):
        raise ConfigError("El modelo de Gemini directo debe ser un ID sin prefijo google/.")
    if provider == "openrouter" and model and "/" not in model:
        raise ConfigError("El modelo de OpenRouter debe incluir proveedor/modelo.")


def encode_value(value):
    # Compose single quotes preserve dollar signs and shell metacharacters literally.
    return "'" + value.replace("'", "\\'") + "'"


def atomic_write(path, content):
    path = Path(path)
    if not path.parent.exists():
        path.parent.mkdir(parents=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def apply_config(path, updates):
    path = Path(path)
    # A deployment updates an existing installation; never create DB secrets here.
    if not path.is_file():
        raise ConfigError("No existe el .env de destino; provisiona la instalación primero.")
    text = path.read_text(encoding="utf-8")
    existing = read_values(text, (*KEYS, "BAZPOS_LLM_API_KEY"))
    validate(updates, existing)
    seen = set()
    lines = []
    for line in text.splitlines(keepends=True):
        match = ASSIGNMENT.match(line.rstrip("\r\n"))
        if match and match[1] in updates:
            key = match[1]
            if key not in seen:
                lines.append(f"{key}={encode_value(updates[key])}\n")
                seen.add(key)
        else:
            lines.append(line)
    additions = [key for key in KEYS if key in updates and key not in seen]
    if additions and lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    lines.extend(f"{key}={encode_value(updates[key])}\n" for key in additions)
    content = "".join(lines)
    if content != text:
        atomic_write(path, content)
    else:
        path.chmod(0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export")
    source = export.add_mutually_exclusive_group(required=True)
    source.add_argument("--source", type=Path)
    source.add_argument("--environment", action="store_true")
    export.add_argument("--output", type=Path, required=True)
    export.add_argument("--ocr-only", action="store_true", help="Do not change deployed image tags.")
    export.add_argument("--github-env", type=Path, help="Register a masked SSH payload in GITHUB_ENV.")
    apply = sub.add_parser("apply")
    apply.add_argument("--target", type=Path, required=True)
    apply.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "export":
            keys = OCR_KEYS if args.ocr_only else KEYS
            if args.source:
                values = read_values(args.source.read_text(encoding="utf-8"), keys)
            else:
                # Unconfigured Actions secrets/vars arrive as empty strings.
                # Preserve remote values unless a nonempty replacement was configured.
                values = {key: os.environ[key] for key in keys if os.environ.get(key)}
            if any(any(c in value for c in "\r\n\x00") for value in values.values()):
                raise ConfigError("La configuración contiene valores de varias líneas.")
            if args.github_env and os.environ.get("GITHUB_ACTIONS") != "true":
                raise ConfigError("--github-env solo está disponible dentro de GitHub Actions.")
            content = json.dumps(values)
            atomic_write(args.output, content)
            if args.github_env:
                # Mask the derived value before exposing it to subsequent action steps.
                encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
                print(f"::add-mask::{encoded}", flush=True)
                with args.github_env.open("a", encoding="utf-8") as stream:
                    stream.write(f"BAZPOS_RUNTIME_CONFIG_B64={encoded}\n")
        else:
            try:
                updates = json.loads(args.input.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                raise ConfigError("El paquete de configuración no es JSON válido.") from None
            apply_config(args.target, updates)
            print("Configuración de imágenes/OCR sincronizada; secretos ocultos.")
    except (ConfigError, OSError) as error:
        # Never include raw file contents or JSON parse error excerpts.
        if isinstance(error, ConfigError):
            parser.exit(1, f"ERROR: {error}\n")
        parser.exit(1, "ERROR: no se pudo leer/escribir la configuración de despliegue.\n")


if __name__ == "__main__":
    main()
