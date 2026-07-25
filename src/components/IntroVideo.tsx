/**
 * IntroVideo — per-session intro screen using the existing project video.
 *
 * Uses the pre-existing asset at /videos/Viora-intro.mp4 (never uploads,
 * renames, or duplicates it). Tracks completion in sessionStorage under
 * `viora_intro_seen_v1` so the intro shows once per browser session and
 * never blocks app entry: skip, video-end, playback error and slow-load
 * timeout all route through the same safe finish path.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SESSION_KEY = "viora_intro_seen_v1";
const VIDEO_SRC = "/videos/Viora-intro.mp4";
const POSTER_SRC = "/logo.svg";
const LOAD_TIMEOUT_MS = 6000;

export function IntroVideo() {
  const [state, setState] = useState<"loading" | "playing" | "done">("loading");
  const [fadeOut, setFadeOut] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const finishedRef = useRef(false);
  const skipBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* storage blocked — treat as unseen but still safe */
    }
    if (seen || prefersReduced) {
      setState("done");
      return;
    }
    setState("playing");
  }, []);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setFadeOut(true);
    setTimeout(() => setState("done"), 350);
  };

  // Prevent background scroll while visible + slow-load safety timeout
  useEffect(() => {
    if (state !== "playing") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    skipBtnRef.current?.focus();
    const timer = window.setTimeout(() => {
      // Fail-open if playback hasn't started in a reasonable window
      if (!videoRef.current || videoRef.current.paused) finish();
    }, LOAD_TIMEOUT_MS);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(timer);
    };
  }, [state]);

  if (state !== "playing") return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] grid place-items-center bg-black transition-opacity duration-300",
        fadeOut ? "opacity-0" : "opacity-100",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Viora intro"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={VIDEO_SRC}
        poster={POSTER_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
      />

      <button
        ref={skipBtnRef}
        type="button"
        onClick={finish}
        aria-label="דלג על סרטון הפתיחה"
        className="absolute top-[calc(env(safe-area-inset-top)+16px)] right-4 rounded-full border border-white/20 bg-black/50 px-4 py-1.5 text-[13px] font-semibold text-white backdrop-blur-md outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
      >
        דלג
      </button>
    </div>
  );
}
