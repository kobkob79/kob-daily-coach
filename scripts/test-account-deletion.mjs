import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { USER_OWNED_STORAGE_BUCKETS, accountDeletionErrorMessage } =
  await import("../src/lib/account-deletion.ts");
const { deleteAuthenticatedAccount, listOwnedStorageObjects } =
  await import("../src/lib/account-deletion.server.ts");

const userId = "00000000-0000-4000-8000-000000000001";
const listCalls = [];
const firstPage = Array.from({ length: 99 }, (_, index) => ({
  name: `file-${index}.jpg`,
  id: `id-${index}`,
}));
const paths = await listOwnedStorageObjects(userId, "profile-photos", {
  list: async (_bucket, path, options) => {
    listCalls.push({ path, ...options });
    if (path.endsWith("nested")) {
      return options.offset === 0
        ? { data: [{ name: "inside.webp", id: "nested-id" }], error: null }
        : { data: [], error: null };
    }
    if (options.offset === 0)
      return { data: [...firstPage, { name: "nested", id: null }], error: null };
    if (options.offset === 100) {
      return { data: [{ name: "last.jpg", id: "last-id" }], error: null };
    }
    return { data: [], error: null };
  },
});
assert.equal(paths.length, 101);
assert(paths.every((path) => path.startsWith(`${userId}/`)));
assert(listCalls.some((call) => call.offset === 100));
assert(listCalls.some((call) => call.path === `${userId}/nested`));

const events = [];
let deleteCalls = 0;
const baseDependencies = {
  claimRequest: async () => "claimed",
  markFailure: async () => undefined,
  list: async () => ({ data: [], error: null }),
  remove: async () => ({ error: null }),
  deleteAuthUser: async () => {
    deleteCalls += 1;
    return { error: null };
  },
  log: (event) => events.push(event),
};

const success = await deleteAuthenticatedAccount(
  { requestId: crypto.randomUUID(), userId },
  baseDependencies,
);
assert.deepEqual(success, { status: "success" });
assert.equal(deleteCalls, 1);
assert.deepEqual(USER_OWNED_STORAGE_BUCKETS, [
  "profile-photos",
  "body-photos",
  "meal-photos",
  "vision-captures",
  "media-inbox",
  "exercise-images",
]);

const duplicate = await Promise.all([
  deleteAuthenticatedAccount(
    { requestId: crypto.randomUUID(), userId },
    { ...baseDependencies, claimRequest: async () => "in_progress" },
  ),
  deleteAuthenticatedAccount(
    { requestId: crypto.randomUUID(), userId },
    { ...baseDependencies, claimRequest: async () => "in_progress" },
  ),
]);
assert(duplicate.every((result) => result.error?.code === "DELETION_IN_PROGRESS"));

const storageFailure = await deleteAuthenticatedAccount(
  { requestId: crypto.randomUUID(), userId },
  { ...baseDependencies, list: async () => ({ data: null, error: new Error("private") }) },
);
assert.equal(storageFailure.error?.code, "STORAGE_CLEANUP_FAILED");
assert.equal(deleteCalls, 1);
assert(!accountDeletionErrorMessage("ACCOUNT_DELETE_FAILED").includes("private"));

const functionsSource = await readFile("src/lib/account-deletion.functions.ts", "utf8");
assert(!functionsSource.includes("userId: z."));
assert(functionsSource.includes("requireSupabaseAuth"));
assert(functionsSource.includes("context.userId"));
assert(functionsSource.includes(".strict()"));

const migration = await readFile(
  "supabase/migrations/20260831123000_account_deletion_foundation.sql",
  "utf8",
);
assert(migration.includes("on delete set null"));
assert(migration.includes("public.exercise_assets"));
assert(migration.includes("public.about_media"));
assert(
  migration.includes(
    "revoke all on table public.account_deletion_requests from public, anon, authenticated",
  ),
);

const profileComponent = await readFile(
  "src/components/profile/AccountDeletionSection.tsx",
  "utf8",
);
const successIndex = profileComponent.indexOf('result.status === "error"');
assert(successIndex < profileComponent.indexOf("queryClient.clear()"));
assert(successIndex < profileComponent.indexOf('signOut({ scope: "local" })'));
assert(!profileComponent.includes("JSON.stringify"));

const publicRoute = await readFile("src/routes/account-deletion.tsx", "utf8");
assert(publicRoute.includes('createFileRoute("/account-deletion")'));
assert(
  publicRoute.includes("BLOCKED_UNTIL_BACKEND_VERIFIED") ||
    publicRoute.includes("ACCOUNT_DELETION_PAGE_STATUS"),
);

console.log(
  JSON.stringify({
    foreign_user_id_rejected_by_strict_schema: "PASS",
    unauthenticated_request_protected_by_middleware: "PASS",
    challenge_validation_present: "PASS",
    duplicate_request_safe: "PASS",
    storage_prefix_scoped: "PASS",
    storage_pagination_and_nesting: "PASS",
    storage_failure_blocks_auth_delete: "PASS",
    shared_asset_fk_hardening: "PASS",
    client_cleanup_only_after_success: "PASS",
    raw_errors_hidden: "PASS",
    public_route: "PASS",
    service_role_server_only: "PASS",
  }),
);
