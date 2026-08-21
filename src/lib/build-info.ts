import packageMetadata from "../../package.json";

const packageVersion = (packageMetadata as { version?: unknown }).version;

const commitCandidates = [
  import.meta.env.VITE_GIT_COMMIT_SHA,
  import.meta.env.VITE_COMMIT_SHA,
  import.meta.env.VITE_GITHUB_SHA,
  import.meta.env.VITE_CF_PAGES_COMMIT_SHA,
  import.meta.env.VITE_LOVABLE_COMMIT_SHA,
];

function resolveCommitHash(): string {
  const commit = commitCandidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && /^[0-9a-f]{7,40}$/i.test(candidate.trim()),
  );

  return commit ? commit.trim().slice(0, 7) : "unknown";
}

export const appVersion =
  typeof packageVersion === "string" && packageVersion.trim() ? packageVersion.trim() : "unknown";

export const commitHash = resolveCommitHash();
export const buildLabel = `v${appVersion} · ${commitHash}`;
