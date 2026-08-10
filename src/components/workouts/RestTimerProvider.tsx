/**
 * RestTimerProvider — the single owner of rest-timer runtime for an active
 * workout session (VIORA-WORKOUT reliability fix).
 *
 * Mounted once by the session layout route, so the timer, its zero detection,
 * repeat reminders, chime/vibration/notification side effects and the floating
 * UI all survive navigation between the overview and any exercise route.
 *
 * Child routes consume state through `useSessionRestTimer()` — they must never
 * call `useRestTimer` themselves, otherwise alerts would fire twice.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { FloatingRestTimer } from "@/components/workouts/FloatingRestTimer";
import { useRestTimer, type RestTimerState } from "@/hooks/useRestTimer";

/** Optional context a child route can publish for the floating sheet label. */
export interface RestSetContext {
  nextSetNumber: number | null;
  totalSets: number;
}

interface RestTimerContextValue extends RestTimerState {
  /** Publish "next set X / Y" info; pass null to clear. Safe to call in effects. */
  setSetContext: (ctx: RestSetContext | null) => void;
  /** Register a callback fired after the athlete skips rest (e.g. scroll). */
  registerSkipHandler: (fn: (() => void) | null) => void;
}

const RestTimerContext = createContext<RestTimerContextValue | null>(null);

export function useSessionRestTimer(): RestTimerContextValue {
  const ctx = useContext(RestTimerContext);
  if (!ctx) throw new Error("useSessionRestTimer must be used inside RestTimerProvider");
  return ctx;
}

export function RestTimerProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: React.ReactNode;
}) {
  const rest = useRestTimer(sessionId);
  const [setCtx, setSetContext] = useState<RestSetContext | null>(null);
  const skipRef = useRef<(() => void) | null>(null);

  const value = useMemo<RestTimerContextValue>(
    () => ({
      ...rest,
      setSetContext,
      registerSkipHandler: (fn) => {
        skipRef.current = fn;
      },
    }),
    [rest],
  );

  // Recompute nothing on unmount except the label — the timer itself lives on
  // in sessionStorage and in this provider.
  useEffect(() => () => setSetContext(null), [sessionId]);

  return (
    <RestTimerContext.Provider value={value}>
      {children}
      {rest.active && (
        <FloatingRestTimer
          phase={rest.phase}
          paused={rest.paused}
          remainingSec={rest.remainingSec}
          overtimeSec={rest.overtimeSec}
          plannedSec={rest.plannedSec}
          nextSetNumber={setCtx?.nextSetNumber ?? null}
          totalSets={setCtx?.totalSets ?? 0}
          soundEnabled={rest.soundEnabled}
          onToggleSound={rest.toggleSound}
          onTogglePause={rest.togglePause}
          onAddSeconds={(d: number) => rest.addSeconds(d)}
          onSkip={() => {
            rest.clear();
            skipRef.current?.();
          }}
        />
      )}
    </RestTimerContext.Provider>
  );
}
