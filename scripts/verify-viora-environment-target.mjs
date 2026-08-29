#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CANONICAL_PRODUCTION_REF = "dyzfauesfqzwgaunfagk";
const KNOWN_NON_PRODUCTION_REFS = new Set(["hvrdnezixxdkpjgroezn", "basaxxfmccdgisputfma"]);
const REF_PATTERN = /^[a-z0-9]{20}$/;
const SUPABASE_URL_PATTERN = /^https:\/\/([a-z0-9]{20})\.supabase\.co(?:\/.*)?$/i;
const RECOGNIZED_ENV_NAMES = new Set([
  "SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
]);
const REPOSITORY_ENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];

function parseArguments(argv) {
  let root = process.cwd();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a directory path");
      root = path.resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--production") continue;
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { root };
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function refFromValue(name, value) {
  const normalized = unquote(value);
  if (!normalized) return null;

  if (name.endsWith("_URL")) {
    return normalized.match(SUPABASE_URL_PATTERN)?.[1]?.toLowerCase() ?? null;
  }

  return REF_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function collectRecognizedAssignments(contents, source, evidence) {
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match || !RECOGNIZED_ENV_NAMES.has(match[1])) continue;
    const ref = refFromValue(match[1], match[2]);
    if (ref) evidence.push({ ref, source: `${source}:${match[1]}` });
  }
}

async function readIfPresent(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function collectEvidence(root) {
  const evidence = [];

  for (const name of RECOGNIZED_ENV_NAMES) {
    const value = process.env[name];
    if (typeof value !== "string") continue;
    const ref = refFromValue(name, value);
    if (ref) evidence.push({ ref, source: `environment:${name}` });
  }

  for (const relativePath of REPOSITORY_ENV_FILES) {
    const contents = await readIfPresent(path.join(root, relativePath));
    if (contents !== null) {
      collectRecognizedAssignments(contents, relativePath, evidence);
    }
  }

  const supabaseConfig = await readIfPresent(path.join(root, "supabase", "config.toml"));
  if (supabaseConfig !== null) {
    const match = supabaseConfig.match(/^\s*project_id\s*=\s*["']([a-z0-9]{20})["']/imu);
    if (match)
      evidence.push({ ref: match[1].toLowerCase(), source: "supabase/config.toml:project_id" });
  }

  const manifest = await readIfPresent(path.join(root, ".lovable", "mcp", "manifest.json"));
  if (manifest !== null) {
    const refs = manifest.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co(?:\/[^"'\s]*)?/giu);
    for (const match of refs) {
      evidence.push({
        ref: match[1].toLowerCase(),
        source: ".lovable/mcp/manifest.json:Supabase URL",
      });
    }
  }

  return evidence;
}

function formatRef(ref) {
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

async function main() {
  const { root } = parseArguments(process.argv.slice(2));
  const evidence = await collectEvidence(root);
  const refs = [...new Set(evidence.map(({ ref }) => ref))];

  if (refs.length === 0) {
    throw new Error("Production target verification failed: no Supabase project ref was found.");
  }

  if (refs.length > 1) {
    throw new Error(
      `Production target verification failed: conflicting project refs were found (${refs.map(formatRef).join(", ")}).`,
    );
  }

  const [ref] = refs;
  if (KNOWN_NON_PRODUCTION_REFS.has(ref)) {
    throw new Error(
      `Production target verification failed: ${formatRef(ref)} is registered as non-production.`,
    );
  }

  if (ref !== CANONICAL_PRODUCTION_REF) {
    throw new Error(
      `Production target verification failed: ${formatRef(ref)} is not the canonical production ref.`,
    );
  }

  console.log(
    `Viora production target verified: ${formatRef(CANONICAL_PRODUCTION_REF)} (${evidence.length} matching source${evidence.length === 1 ? "" : "s"}).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Production target verification failed.");
  process.exitCode = 1;
});
