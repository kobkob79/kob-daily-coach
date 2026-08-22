/**
 * plan-ui — UI-ONLY presentation state for the Viora FREE / PREMIUM
 * experience and the "Connect your own AI" flow.
 *
 * This module intentionally contains NO billing, no backend calls, no key
 * storage and no provider connections. It only remembers, locally on the
 * device, which UX state should be rendered so the experience can be
 * designed and reviewed. Real entitlement + provider linking will replace
 * this layer later without touching the components.
 */
import { useCallback, useEffect, useState } from "react";

export type VioraPlan = "free" | "premium";
export type AIConnectionState = "disconnected" | "connected";

export interface AIConnectionUI {
  provider: "openai";
  providerLabel: string;
  state: AIConnectionState;
  /** ISO string of the last successful validation (display only). */
  lastValidatedAt: string | null;
}

const PLAN_KEY = "viora.ui.plan";
const AI_KEY = "viora.ui.aiConnection";
const EVENT = "viora:plan-ui-changed";

export const AI_PROVIDER_LABEL = "OpenAI";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* presentation state only — safe to ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

const DEFAULT_CONNECTION: AIConnectionUI = {
  provider: "openai",
  providerLabel: AI_PROVIDER_LABEL,
  state: "disconnected",
  lastValidatedAt: null,
};

/**
 * Reactive access to the FREE/PREMIUM + AI-connection presentation state.
 * Values are hydration-safe: the first client render uses defaults and
 * syncs from storage inside an effect.
 */
export function useVioraPlanUI() {
  const [plan, setPlanState] = useState<VioraPlan>("free");
  const [connection, setConnectionState] = useState<AIConnectionUI>(DEFAULT_CONNECTION);
  const [hydrated, setHydrated] = useState(false);

  const sync = useCallback(() => {
    setPlanState(read<VioraPlan>(PLAN_KEY, "free"));
    setConnectionState({ ...DEFAULT_CONNECTION, ...read(AI_KEY, DEFAULT_CONNECTION) });
  }, []);

  useEffect(() => {
    sync();
    setHydrated(true);
    const handler = () => sync();
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [sync]);

  const setPlan = useCallback((next: VioraPlan) => write(PLAN_KEY, next), []);

  const connect = useCallback(() => {
    write(AI_KEY, {
      ...DEFAULT_CONNECTION,
      state: "connected",
      lastValidatedAt: new Date().toISOString(),
    } satisfies AIConnectionUI);
  }, []);

  const validate = useCallback(() => {
    write(AI_KEY, {
      ...DEFAULT_CONNECTION,
      state: "connected",
      lastValidatedAt: new Date().toISOString(),
    } satisfies AIConnectionUI);
  }, []);

  const disconnect = useCallback(() => write(AI_KEY, DEFAULT_CONNECTION), []);

  const isPremium = plan === "premium";
  const isConnected = connection.state === "connected";

  return {
    hydrated,
    plan,
    isPremium,
    connection,
    isConnected,
    /** AI surfaces are usable only for premium users with a linked provider. */
    aiReady: isPremium && isConnected,
    setPlan,
    connect,
    validate,
    disconnect,
  };
}
