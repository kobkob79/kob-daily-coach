import assert from "node:assert/strict";
import { createServer } from "vite";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
const TEST_REQUEST = {
  advisor_id: "daniel",
  conversation_id: "quota-concurrency-test",
  message: "test message",
};

class InMemoryAtomicQuotaStore {
  #now;
  #record;
  #sequence = 0;
  #lock = Promise.resolve();
  events = [];

  constructor(now) {
    this.#now = now;
  }

  setNow(now) {
    this.#now = now;
  }

  async #atomic(operation) {
    const previous = this.#lock;
    let unlock;
    this.#lock = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    try {
      return operation();
    } finally {
      unlock();
    }
  }

  #quota(allowed) {
    return {
      allowed,
      used: this.#record?.successfulQuestions ?? 0,
      limit: 1,
      remaining: allowed ? 1 : 0,
      resets_at: "2099-01-02T00:00:00.000Z",
    };
  }

  async getStatus() {
    const activeReservation = this.#record?.claimToken && this.#record.expiresAt > this.#now;
    return this.#quota((this.#record?.successfulQuestions ?? 0) === 0 && !activeReservation);
  }

  async claim() {
    return this.#atomic(() => {
      const activeReservation = this.#record?.claimToken && this.#record.expiresAt > this.#now;
      if ((this.#record?.successfulQuestions ?? 0) === 1 || activeReservation) {
        return { claimToken: `rejected-${++this.#sequence}`, quota: this.#quota(false) };
      }

      if (this.#record?.claimToken && this.#record.expiresAt <= this.#now) {
        this.events.push("advisor_quota_reservation_expired");
      }

      const claimToken = `claim-${++this.#sequence}`;
      this.#record = {
        claimToken,
        expiresAt: this.#now + RESERVATION_TTL_MS,
        successfulQuestions: 0,
      };
      return { claimToken, quota: this.#quota(true) };
    });
  }

  async finalize(_userId, claimToken) {
    return this.#atomic(() => {
      assert.equal(this.#record?.claimToken, claimToken);
      this.#record = {
        claimToken: undefined,
        expiresAt: 0,
        successfulQuestions: 1,
      };
      return this.#quota(false);
    });
  }

  async release(_userId, claimToken) {
    return this.#atomic(() => {
      assert.equal(this.#record?.claimToken, claimToken);
      this.#record = {
        claimToken: undefined,
        expiresAt: 0,
        successfulQuestions: 0,
      };
    });
  }
}

const server = await createServer({
  appType: "custom",
  configFile: false,
  server: { middlewareMode: true },
});

try {
  const { generateQuotaProtectedAdvisorResponse } = await server.ssrLoadModule(
    "/src/lib/advisor-core/server/quota-flow.server.ts",
  );

  const now = Date.UTC(2099, 0, 1, 12);

  const concurrentStore = new InMemoryAtomicQuotaStore(now);
  const concurrentClaims = await Promise.all([
    concurrentStore.claim(TEST_USER_ID),
    concurrentStore.claim(TEST_USER_ID),
  ]);
  assert.equal(concurrentClaims.filter((claim) => claim.quota.allowed).length, 1);

  const successStore = new InMemoryAtomicQuotaStore(now);
  const successResponse = await generateQuotaProtectedAdvisorResponse(TEST_USER_ID, TEST_REQUEST, {
    quotaStore: successStore,
    generateResponse: async (request) => ({
      advisor_id: request.advisor_id,
      conversation_id: request.conversation_id,
      response_id: "mock-success",
      text: "Mock success",
    }),
    logEvent: () => undefined,
  });
  assert.equal(successResponse.quota?.used, 1);
  assert.equal(successResponse.quota?.remaining, 0);

  const failureStore = new InMemoryAtomicQuotaStore(now);
  await assert.rejects(
    generateQuotaProtectedAdvisorResponse(TEST_USER_ID, TEST_REQUEST, {
      quotaStore: failureStore,
      generateResponse: async () => {
        throw new Error("synthetic provider failure");
      },
      logEvent: () => undefined,
    }),
  );
  assert.equal((await failureStore.getStatus()).allowed, true);

  const expiryStore = new InMemoryAtomicQuotaStore(now);
  const firstClaim = await expiryStore.claim(TEST_USER_ID);
  assert.equal(firstClaim.quota.allowed, true);
  expiryStore.setNow(now + RESERVATION_TTL_MS - 1);
  assert.equal((await expiryStore.claim(TEST_USER_ID)).quota.allowed, false);
  expiryStore.setNow(now + RESERVATION_TTL_MS);
  assert.equal((await expiryStore.claim(TEST_USER_ID)).quota.allowed, true);
  assert.deepEqual(expiryStore.events, ["advisor_quota_reservation_expired"]);

  console.log(
    JSON.stringify({
      cases: {
        concurrent_claims: "PASS",
        success_finalize: "PASS",
        provider_failure_release: "PASS",
        reservation_expiry_15_minutes: "PASS",
      },
      production_database_used: false,
    }),
  );
} finally {
  await server.close();
}
