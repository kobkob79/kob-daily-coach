import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({
  appType: "custom",
  configFile: false,
  server: { middlewareMode: true },
});
const advisors = ["adam", "daniel", "maya", "shiran"];

try {
  const { generateQuotaProtectedAdvisorResponse } = await server.ssrLoadModule(
    "/src/lib/advisor-core/server/quota-flow.server.ts",
  );
  let claimCalls = 0;
  const exhaustedStore = {
    async getStatus() {
      return {
        allowed: false,
        used: 1,
        limit: 1,
        remaining: 0,
        resets_at: "2099-01-02T00:00:00.000Z",
      };
    },
    async claim() {
      claimCalls += 1;
      return { claimToken: "blocked", quota: await this.getStatus() };
    },
    async finalize() {
      throw new Error("unexpected finalize");
    },
    async release() {
      throw new Error("unexpected release");
    },
  };

  for (const advisor_id of advisors) {
    const response = await generateQuotaProtectedAdvisorResponse(
      "admin-user",
      { advisor_id, conversation_id: `admin-${advisor_id}`, message: "בדיקת Admin" },
      {
        quotaExempt: true,
        quotaStore: exhaustedStore,
        generateResponse: async (request) => ({
          advisor_id: request.advisor_id,
          conversation_id: request.conversation_id,
          response_id: `ok-${advisor_id}`,
          text: "Admin response",
        }),
      },
    );
    assert.equal(response.advisor_id, advisor_id);
  }
  assert.equal(claimCalls, 0, "Admin must bypass claim/finalize at the server boundary");

  await assert.rejects(
    generateQuotaProtectedAdvisorResponse(
      "normal-user",
      { advisor_id: "daniel", conversation_id: "normal", message: "blocked" },
      {
        quotaStore: exhaustedStore,
        generateResponse: async () => {
          throw new Error("provider must not run");
        },
      },
    ),
    /daily advisor question/i,
  );
  assert.equal(claimCalls, 1);

  await assert.rejects(
    generateQuotaProtectedAdvisorResponse(
      "normal-user",
      { advisor_id: "daniel", conversation_id: "forged", message: "blocked", isAdmin: true },
      {
        quotaStore: exhaustedStore,
        generateResponse: async () => {
          throw new Error("provider must not run");
        },
      },
    ),
    /daily advisor question/i,
  );
  assert.equal(claimCalls, 2, "Client-forged isAdmin must have no effect");

  const serverFn = await readFile(`${root}/src/lib/advisor-chat.functions.ts`, "utf8");
  const chatUi = await readFile(`${root}/src/components/coach/CoachChatShell.tsx`, "utf8");
  assert.match(serverFn, /userHasAdminRole/);
  assert.match(serverFn, /quotaExempt: await isAdminUser\(userId\)/);
  assert.match(chatUi, /quotaState === "unlimited"/);
  assert.match(chatUi, /quotaState !== "unlimited"/);

  console.log(
    JSON.stringify({
      admin_all_four_advisors_unlimited: "PASS",
      ordinary_user_exhausted: "PASS",
      forged_client_admin_ignored: "PASS",
      admin_ui_send_enabled: "PASS",
      server_role_lookup: "PASS",
    }),
  );
} finally {
  await server.close();
}
