import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  FREE_ADVISOR_DAILY_LIMIT,
  type AdvisorDailyQuota,
  type AdvisorQuotaClaim,
  type AdvisorQuotaStore,
} from "../quota";
import { AdvisorCoreError } from "../response";

interface RpcError {
  message: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

interface UntypedRpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
}

function parseQuotaRow(data: unknown): AdvisorDailyQuota {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new AdvisorCoreError(
      "ADVISOR_QUOTA_UNAVAILABLE",
      "Advisor quota is temporarily unavailable.",
    );
  }

  const value = row as Record<string, unknown>;
  if (
    typeof value.allowed !== "boolean" ||
    typeof value.used !== "number" ||
    value.limit !== FREE_ADVISOR_DAILY_LIMIT ||
    typeof value.remaining !== "number" ||
    typeof value.resets_at !== "string"
  ) {
    throw new AdvisorCoreError(
      "ADVISOR_QUOTA_UNAVAILABLE",
      "Advisor quota returned an invalid response.",
    );
  }

  return {
    allowed: value.allowed,
    used: value.used,
    limit: FREE_ADVISOR_DAILY_LIMIT,
    remaining: value.remaining,
    resets_at: value.resets_at,
  };
}

async function callQuotaRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const client = supabaseAdmin as unknown as UntypedRpcClient;
  const { data, error } = await client.rpc(name, args);

  if (error) {
    throw new AdvisorCoreError(
      "ADVISOR_QUOTA_UNAVAILABLE",
      "Advisor quota is temporarily unavailable.",
    );
  }

  return data;
}

export const supabaseAdvisorQuotaStore: AdvisorQuotaStore = {
  async getStatus(userId) {
    const data = await callQuotaRpc("get_advisor_daily_quota", {
      p_user_id: userId,
    });
    return parseQuotaRow(data);
  },

  async claim(userId): Promise<AdvisorQuotaClaim> {
    const claimToken = randomUUID();
    const data = await callQuotaRpc("claim_advisor_daily_quota", {
      p_user_id: userId,
      p_claim_token: claimToken,
    });

    return { claimToken, quota: parseQuotaRow(data) };
  },

  async finalize(userId, claimToken) {
    const data = await callQuotaRpc("finalize_advisor_daily_quota", {
      p_user_id: userId,
      p_claim_token: claimToken,
    });
    return parseQuotaRow(data);
  },

  async release(userId, claimToken) {
    await callQuotaRpc("release_advisor_daily_quota", {
      p_user_id: userId,
      p_claim_token: claimToken,
    });
  },
};
