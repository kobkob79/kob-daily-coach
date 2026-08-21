import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  server: { middlewareMode: true },
});

try {
  const { AVATAR_RAW_MAX_BYTES, removeProfileAvatar, replaceProfileAvatar, validateAvatarFile } =
    await server.ssrLoadModule("/src/lib/avatar-flow.ts");

  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  for (const type of validTypes) {
    assert.doesNotThrow(() => validateAvatarFile(new File(["ok"], "avatar", { type })));
  }
  assert.throws(() =>
    validateAvatarFile(new File(["bad"], "avatar.svg", { type: "image/svg+xml" })),
  );
  assert.throws(() =>
    validateAvatarFile(
      new File([new Uint8Array(AVATAR_RAW_MAX_BYTES + 1)], "large.jpg", {
        type: "image/jpeg",
      }),
    ),
  );

  const userId = "00000000-0000-4000-8000-000000000001";
  const source = new File(["source"], "source.png", { type: "image/png" });
  const processed = new File(["processed"], "avatar.jpg", { type: "image/jpeg" });

  const successEvents = [];
  const successPath = await replaceProfileAvatar(source, `${userId}/old.jpg`, userId, {
    processImage: async () => processed,
    upload: async (path) => successEvents.push(`upload:${path}`),
    updateProfile: async (path) => successEvents.push(`profile:${path}`),
    remove: async (path) => successEvents.push(`remove:${path}`),
    createObjectId: () => "generated-id",
  });
  assert.equal(successPath, `${userId}/generated-id.jpg`);
  assert.deepEqual(successEvents, [
    `upload:${userId}/generated-id.jpg`,
    `profile:${userId}/generated-id.jpg`,
    `remove:${userId}/old.jpg`,
  ]);

  const rollbackEvents = [];
  await assert.rejects(
    replaceProfileAvatar(source, `${userId}/old.jpg`, userId, {
      processImage: async () => processed,
      upload: async (path) => rollbackEvents.push(`upload:${path}`),
      updateProfile: async () => {
        rollbackEvents.push("profile:failed");
        throw new Error("synthetic profile failure");
      },
      remove: async (path) => rollbackEvents.push(`remove:${path}`),
      createObjectId: () => "rollback-id",
    }),
  );
  assert.deepEqual(rollbackEvents, [
    `upload:${userId}/rollback-id.jpg`,
    "profile:failed",
    `remove:${userId}/rollback-id.jpg`,
  ]);

  const cleanupLogs = [];
  const cleanupPath = await replaceProfileAvatar(source, `${userId}/old.jpg`, userId, {
    processImage: async () => processed,
    upload: async () => undefined,
    updateProfile: async () => undefined,
    remove: async (path) => {
      if (path.endsWith("old.jpg")) throw new Error("synthetic delete failure");
    },
    createObjectId: () => "cleanup-id",
    log: (event) => cleanupLogs.push(event),
  });
  assert.equal(cleanupPath, `${userId}/cleanup-id.jpg`);
  assert.deepEqual(cleanupLogs, ["profile_avatar_old_object_delete_failed"]);

  const removeEvents = [];
  await removeProfileAvatar(`${userId}/avatar.jpg`, userId, {
    updateProfile: async (path) => removeEvents.push(`profile:${path}`),
    remove: async (path) => removeEvents.push(`remove:${path}`),
  });
  assert.deepEqual(removeEvents, ["profile:null", `remove:${userId}/avatar.jpg`]);

  const removeFailureLogs = [];
  await removeProfileAvatar(`${userId}/avatar.jpg`, userId, {
    updateProfile: async () => undefined,
    remove: async () => {
      throw new Error("synthetic delete failure");
    },
    log: (event) => removeFailureLogs.push(event),
  });
  assert.deepEqual(removeFailureLogs, ["profile_avatar_removed_object_delete_failed"]);

  const foreignPathEvents = [];
  await removeProfileAvatar("another-user/avatar.jpg", userId, {
    updateProfile: async () => foreignPathEvents.push("profile:null"),
    remove: async () => foreignPathEvents.push("unexpected-delete"),
    log: (event) => foreignPathEvents.push(event),
  });
  assert.deepEqual(foreignPathEvents, ["profile:null", "profile_avatar_unsafe_stored_path"]);

  console.log(
    JSON.stringify({
      jpeg_valid: "PASS",
      png_valid: "PASS",
      webp_valid: "PASS",
      unsupported_mime_rejected: "PASS",
      raw_10mb_limit: "PASS",
      replace_success: "PASS",
      profile_update_failure_rollback: "PASS",
      old_object_delete_failure: "PASS",
      remove_success: "PASS",
      remove_object_delete_failure: "PASS",
      foreign_user_path_not_deleted: "PASS",
    }),
  );
} finally {
  await server.close();
}
