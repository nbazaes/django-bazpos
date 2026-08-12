#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");
const PKG_PATH = path.join(FRONTEND_DIR, "package.json");

const version = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8")).version;

console.log(`\n📦 Generando changelog para la versión ${version}\n`);

execSync(`node scripts/changelog.mjs`, { cwd: FRONTEND_DIR, stdio: "inherit" });

console.log(`
✅ Listo. Próximos pasos sugeridos:
  git add ../CHANGELOG.md
  git commit -m "changelog ${version}"
`);
