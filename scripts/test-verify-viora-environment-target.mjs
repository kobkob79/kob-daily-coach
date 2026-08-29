#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "verify-viora-environment-target.mjs",
);
const SENSITIVE_ENV_NAMES = [
  "SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
];

function runGuard(root) {
  const env = { ...process.env };
  for (const name of SENSITIVE_ENV_NAMES) delete env[name];
  return spawnSync(process.execPath, [SCRIPT_PATH, "--production", "--root", root], {
    encoding: "utf8",
    env,
  });
}

async function withFixture(files, assertion) {
  const root = await mkdtemp(path.join(tmpdir(), "viora-env-guard-"));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const destination = path.join(root, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, contents, "utf8");
    }
    await assertion(runGuard(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const tests = [
  [
    "canonical ref passes",
    { ".env": "SUPABASE_PROJECT_ID=dyzfauesfqzwgaunfagk\n" },
    (result) => {
      assert.equal(result.status, 0, result.stderr);
    },
  ],
  [
    "wrong ref fails",
    { ".env": "SUPABASE_PROJECT_ID=hvrdnezixxdkpjgroezn\n" },
    (result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /non-production/u);
    },
  ],
  [
    "missing ref fails",
    { ".env": "APP_NAME=Viora\n" },
    (result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /no Supabase project ref/u);
    },
  ],
  [
    "conflicting refs fail",
    {
      ".env": "SUPABASE_PROJECT_ID=dyzfauesfqzwgaunfagk\n",
      "supabase/config.toml": 'project_id = "basaxxfmccdgisputfma"\n',
    },
    (result) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /conflicting project refs/u);
    },
  ],
  [
    "secret values are never printed",
    {
      ".env": [
        "SUPABASE_PROJECT_ID=dyzfauesfqzwgaunfagk",
        "SUPABASE_SERVICE_ROLE_KEY=NEVER_PRINT_THIS_SENTINEL",
        "API_SECRET=NEVER_PRINT_THIS_SENTINEL",
        "",
      ].join("\n"),
    },
    (result) => {
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /NEVER_PRINT_THIS_SENTINEL/u);
    },
  ],
];

for (const [name, files, assertion] of tests) {
  await withFixture(files, assertion);
  console.log(`PASS ${name}`);
}
