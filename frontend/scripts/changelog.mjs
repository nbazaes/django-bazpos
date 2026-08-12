#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "../..");
const CHANGELOG_PATH = path.join(REPO_ROOT, "CHANGELOG.md");
const PKG_PATH = path.join(FRONTEND_DIR, "package.json");

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openrouter/auto:free";

const SECTION_TITLES = {
  Added: "Agregado",
  Changed: "Cambiado",
  Deprecated: "Obsoleto",
  Removed: "Eliminado",
  Fixed: "Corregido",
  Security: "Seguridad",
  Performance: "Rendimiento",
};

function loadEnv() {
  const envPath = path.join(FRONTEND_DIR, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function git(cmd, fallback = "") {
  try {
    return execSync(cmd, { encoding: "utf-8", maxBuffer: 1e7 }).trim();
  } catch {
    return fallback;
  }
}

const INTERNAL_PREFIXES = /^(refactor|chore|docs|ci|test|build|style|merge|version)(\(.*\))?[: ]/i;

function isUserFacingKey(subject) {
  return /^(feat|fix|perf)(\(.*\))?[: ]/i.test(subject);
}

function getCommitsSince(since) {
  const range = since ? `${since}..HEAD` : "HEAD";
  const raw = git(`git log ${range} --format='%h%x09%s%x09%b%x01'`);
  return raw
    .split("\u0001")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash, subject, ...bodyParts] = chunk.split("\t");
      const body = bodyParts.join("\t").trim();
      return { hash, subject: (subject || "").trim(), body };
    })
    .filter(
      (c) =>
        c.subject &&
        !/^version\s+\d+\.\d+\.\d+/i.test(c.subject) &&
        (isUserFacingKey(c.subject) || !INTERNAL_PREFIXES.test(c.subject)),
    );
}

function commitListText(commits) {
  return commits
    .map((c) => `- ${c.subject}${c.body ? `\n  ${c.body.split("\n").join("\n  ")}` : ""}`)
    .join("\n");
}

function buildPrompt(prevVersion, version, commits) {
  const commitsText = commitListText(commits);
  return `Eres el redactor de changelog de "BAZPOS", una app de punto de venta para una tienda en Chile (idioma: español chileno).

Redacta una entrada de changelog para la versión ${version}${prevVersion ? ` (cambios entre la versión ${prevVersion} y la ${version})` : ""}, a partir del siguiente listado de commits:

${commitsText}

Reglas:
- Enfócate en lo que ve el usuario final. Ignora commits de documentación, CI o internos sin impacto para el usuario.
- Agrupa en secciones: Added, Changed, Fixed, Removed, Performance.
- Máximo ${Math.max(3, Math.min(10, commits.length))} bullets en total, cada uno de una línea, conciso y en tono natural.
- Sin jerga técnica (evita "endpoint", "requery", "migración DB", "refactor"): describe el efecto visible.
- NO uses "docs", "CI", "test". 
- Responde SOLO con un JSON válido, sin texto adicional, con esta forma exacta:
[{"type":"Added","items":["Descripción 1","Descripción 2"]},{"type":"Fixed","items":["Descripción 1"]}]`;
}

async function callLLM(prompt) {
  const baseUrl = (process.env.BAZPOS_LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.BAZPOS_LLM_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.BAZPOS_LLM_API_KEY;

  if (!apiKey) throw new Error("no api key");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "BAZPOS",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM responded ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");
  return content;
}

function extractJSON(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : content;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("no json array found");
  return JSON.parse(candidate.slice(start, end + 1));
}

function fallbackSections(commits) {
  const map = [
    [/^feat(\(.*\))?[: ]/i, "Added"],
    [/^fix(\(.*\))?[: ]/i, "Fixed"],
    [/^perf(\(.*\))?[: ]/i, "Performance"],
    [/^(refactor|chore|docs|ci|test|build|style)(\(.*\))?[: ]/i, null],
  ];
  const sections = {};
  for (const c of commits) {
    const [, section] = map.find(([re]) => re.test(c.subject)) || [null, "Changed"];
    if (!section) continue;
    const text = c.subject.replace(/^(feat|fix|perf|refactor|chore|docs|ci|test|build|style)(\([^)]*\))?[: ]/i, "").trim();
    if (!text) continue;
    (sections[section] ||= []).push(text);
  }
  return Object.entries(sections).map(([type, items]) => ({ type, items }));
}

function renderEntry(version, sections) {
  if (!sections || sections.length === 0) return null;
  const parts = [`## [${version}] - ${new Date().toISOString().slice(0, 10)}`];
  for (const section of sections) {
    if (!section.items?.length) continue;
    const title = SECTION_TITLES[section.type] || section.type;
    parts.push("", `### ${title}`, "");
    for (const item of section.items) parts.push(`- ${item}`);
  }
  return parts.join("\n");
}

function insertEntry(entryText) {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    fs.writeFileSync(CHANGELOG_PATH, `# Changelog\n\n${entryText}\n`);
    return;
  }
  const original = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  const lines = original.split("\n");
  const firstReleaseIdx = lines.findIndex((l) => /^##\s+\[/.test(l.trim()));
  const entryLines = entryText.split("\n");
  const newContent =
    firstReleaseIdx === -1
      ? `${original.replace(/\s*$/, "")}\n\n${entryText}\n`
      : [...lines.slice(0, firstReleaseIdx), ...entryLines, ...lines.slice(firstReleaseIdx)].join(
          "\n",
        );
  fs.writeFileSync(CHANGELOG_PATH, newContent.replace(/\n{3,}/g, "\n\n"));
}

async function main() {
  loadEnv();

  const argv = process.argv.slice(2);
  const versionArg = argv.find((a) => a.startsWith("--version="))?.split("=")[1];
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
  const version = versionArg || pkg.version;

  const lastReleaseHash = git(`git log --grep='^version ' --format=%H -1`);
  const prevVersion = lastReleaseHash
    ? git(`git log --format=%s -1 ${lastReleaseHash}`).match(/(\d+\.\d+\.\d+)/)?.[1]
    : undefined;

  const commits = getCommitsSince(lastReleaseHash);
  if (commits.length === 0) {
    console.log("No hay commits nuevos desde la última versión. Nada que generar.");
    process.exit(0);
  }

  console.log(
    `Generando changelog para ${version}${prevVersion ? ` (desde ${prevVersion})` : ""} — ${commits.length} commits.`,
  );

  let sections;
  let usedLLM = true;
  try {
    const prompt = buildPrompt(prevVersion, version, commits);
    const content = await callLLM(prompt);
    sections = extractJSON(content);
  } catch (err) {
    usedLLM = false;
    console.warn(`\n⚠️  OpenRouter no disponible (${err.message}).`);
    console.warn("Se generará un listado básico a partir de los títulos de commits. Revísalo antes de publicar.\n");
    sections = fallbackSections(commits);
  }

  const entry = renderEntry(version, sections);
  if (!entry) {
    console.log("No hay cambios relevantes para el usuario en esta versión.");
    process.exit(0);
  }

  insertEntry(entry);
  console.log(entry);
  console.log(`\n✍️  Changelog ${usedLLM ? "redactado por IA" : "básico"} escrito en ${CHANGELOG_PATH}`);
  console.log("Revíselo y edítelo antes de commitear.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});