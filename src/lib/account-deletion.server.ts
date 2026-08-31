import { USER_OWNED_STORAGE_BUCKETS, type DeleteMyAccountResult } from "./account-deletion.ts";

const PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;

export interface StorageListItem {
  name: string;
  id?: string | null;
  metadata?: unknown | null;
}

export interface AccountDeletionDependencies {
  claimRequest(input: {
    requestId: string;
    userId: string;
  }): Promise<"claimed" | "resume" | "in_progress">;
  markFailure(
    requestId: string,
    status: "storage_failed" | "auth_failed",
    code: string,
  ): Promise<void>;
  list(
    bucket: string,
    path: string,
    options: { limit: number; offset: number },
  ): Promise<{
    data: StorageListItem[] | null;
    error: unknown;
  }>;
  remove(bucket: string, paths: string[]): Promise<{ error: unknown }>;
  deleteAuthUser(userId: string): Promise<{ error: unknown }>;
  log(event: string): void;
}

function isSafeUserPrefix(userId: string, path: string): boolean {
  return path === userId || path.startsWith(`${userId}/`);
}

export async function listOwnedStorageObjects(
  userId: string,
  bucket: string,
  deps: Pick<AccountDeletionDependencies, "list">,
): Promise<string[]> {
  const files: string[] = [];
  const folders = [userId];

  while (folders.length) {
    const folder = folders.pop()!;
    if (!isSafeUserPrefix(userId, folder)) throw new Error("UNSAFE_STORAGE_PREFIX");

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await deps.list(bucket, folder, { limit: PAGE_SIZE, offset });
      if (result.error || !result.data) throw new Error("STORAGE_LIST_FAILED");

      for (const item of result.data) {
        if (!item.name || item.name === "." || item.name === ".." || item.name.includes("/")) {
          throw new Error("UNSAFE_STORAGE_OBJECT_NAME");
        }
        const path = `${folder}/${item.name}`;
        if (!isSafeUserPrefix(userId, path)) throw new Error("UNSAFE_STORAGE_PREFIX");
        if (item.id || item.metadata) files.push(path);
        else folders.push(path);
      }

      if (result.data.length < PAGE_SIZE) break;
    }
  }

  return files;
}

export async function cleanupOwnedStorage(
  userId: string,
  deps: Pick<AccountDeletionDependencies, "list" | "remove">,
): Promise<void> {
  for (const bucket of USER_OWNED_STORAGE_BUCKETS) {
    const paths = await listOwnedStorageObjects(userId, bucket, deps);
    for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
      const batch = paths.slice(index, index + REMOVE_BATCH_SIZE);
      if (batch.some((path) => !isSafeUserPrefix(userId, path))) {
        throw new Error("UNSAFE_STORAGE_PREFIX");
      }
      const result = await deps.remove(bucket, batch);
      if (result.error) throw new Error("STORAGE_REMOVE_FAILED");
    }
    const remaining = await listOwnedStorageObjects(userId, bucket, deps);
    if (remaining.length) throw new Error("STORAGE_VERIFY_FAILED");
  }
}

export async function deleteAuthenticatedAccount(
  input: { requestId: string; userId: string },
  deps: AccountDeletionDependencies,
): Promise<DeleteMyAccountResult> {
  let claim: "claimed" | "resume" | "in_progress";
  try {
    claim = await deps.claimRequest(input);
  } catch {
    deps.log("account_deletion_claim_failed");
    return { status: "error", error: { code: "ACCOUNT_DELETE_FAILED", retryable: true } };
  }
  if (claim === "in_progress") {
    return { status: "error", error: { code: "DELETION_IN_PROGRESS", retryable: true } };
  }

  try {
    await cleanupOwnedStorage(input.userId, deps);
  } catch {
    deps.log("account_deletion_storage_cleanup_failed");
    await deps.markFailure(input.requestId, "storage_failed", "STORAGE_CLEANUP_FAILED");
    return { status: "error", error: { code: "STORAGE_CLEANUP_FAILED", retryable: true } };
  }

  const deleted = await deps.deleteAuthUser(input.userId);
  if (deleted.error) {
    deps.log("account_deletion_auth_delete_failed");
    await deps.markFailure(input.requestId, "auth_failed", "ACCOUNT_DELETE_FAILED");
    return { status: "error", error: { code: "ACCOUNT_DELETE_FAILED", retryable: true } };
  }

  return { status: "success" };
}
