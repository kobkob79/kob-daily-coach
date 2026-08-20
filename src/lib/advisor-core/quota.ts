export const FREE_ADVISOR_DAILY_LIMIT = 1 as const;

export interface AdvisorDailyQuota {
  allowed: boolean;
  used: number;
  limit: typeof FREE_ADVISOR_DAILY_LIMIT;
  remaining: number;
  resets_at: string;
}

export interface AdvisorQuotaClaim {
  claimToken: string;
  quota: AdvisorDailyQuota;
}

export interface AdvisorQuotaStore {
  getStatus(userId: string): Promise<AdvisorDailyQuota>;
  claim(userId: string): Promise<AdvisorQuotaClaim>;
  finalize(userId: string, claimToken: string): Promise<AdvisorDailyQuota>;
  release(userId: string, claimToken: string): Promise<void>;
}
