import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  hasMeaningfulSnapshotChange,
  normalizeExerciseRegistrySnapshot,
  serializeExerciseRegistrySnapshot,
} from "./exercise-registry-snapshot-lib.mjs";

const DEFAULT_SOURCE_URL = "https://kob-daily-coach.lovable.app/api/exercise-registry";
const sourceUrl = process.env.REGISTRY_SNAPSHOT_SOURCE_URL || DEFAULT_SOURCE_URL;
const snapshotUrl = new URL("../agent-data/exercise-registry.snapshot.json", import.meta.url);
const snapshotPath = fileURLToPath(snapshotUrl);

async function readCurrentSnapshot() {
  try {
    return await readFile(snapshotUrl, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  console.log(`Registry snapshot source: ${sourceUrl}`);
  console.log(`Registry snapshot path: ${snapshotPath}`);

  const response = await fetch(sourceUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Registry snapshot fetch failed with HTTP ${response.status}`);
  }

  const normalized = normalizeExerciseRegistrySnapshot(await response.json());
  const nextText = serializeExerciseRegistrySnapshot(normalized);
  const currentText = await readCurrentSnapshot();
  const changed = hasMeaningfulSnapshotChange(currentText, nextText);

  if (changed) await writeFile(snapshotUrl, nextText, "utf8");

  const next = normalized.nextRecommendedExercise;
  console.log(`Registry snapshot changed: ${changed ? "yes" : "no"}`);
  console.log(`Registry exercise count: ${normalized.exercises.length}`);
  console.log(
    next
      ? `Next recommended exercise: ${next.exerciseNumber} - ${next.canonicalHebrewName}`
      : "Next recommended exercise: none",
  );
}

main().catch((error) => {
  console.error(`Registry snapshot sync failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
