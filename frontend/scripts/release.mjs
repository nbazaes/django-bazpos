#!/usr/bin/env node
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");

const bump = process.argv[2] || "patch";
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Uso: npm run release -- [patch|minor|major]");
  process.exit(1);
}

const pkg = JSON.parse(
  execSync(`node -e "console.log(JSON.stringify(require('${FRONTEND_DIR}/package.json')))"`, {
    encoding: "utf-8",
  }),
);
const oldVersion = pkg.version;
const [major, minor, patch] = oldVersion.split(".").map(Number);
let newVersion;
if (bump === "major") newVersion = `${major + 1}.0.0`;
else if (bump === "minor") newVersion = `${major}.${minor + 1}.0`;
else newVersion = `${major}.${minor}.${patch + 1}`;

console.log(`\n📦 bump ${bump}: ${oldVersion} → ${newVersion}\n`);

execSync(`npm version ${bump} --no-git-tag-version`, { cwd: FRONTEND_DIR, stdio: "inherit" });

execSync(`node scripts/changelog.mjs --version=${newVersion}`, {
  cwd: FRONTEND_DIR,
  stdio: "inherit",
});

console.log(`
✅ Listo. Próximos pasos sugeridos:
  git add package.json package-lock.json ../CHANGELOG.md (u otros y el changelog)
  git commit -m "version ${newVersion}"
`);
