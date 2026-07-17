/**
 * IntroVideo — first-launch fullscreen intro.
 *
 * Behaviour:
 *   • Reads/writes completion state via ai_memory (key: first_launch_video_seen).
 *   • Muted, autoplay, playsinline. Static poster while loading.
 *   • Skip button always available; fades out on complete or skip.
 *   • If the video fails to load, or the user prefers reduced motion, we
 *     mark it seen immediately so the app never blocks.
 *   • Never re-plays automatically after a successful completion.
 *
 * The video file itself is expected to be uploaded to `/intro-video.mp4`
 * (public folder) — we do not ship one. If the file is missing the
 * component gracefully bails out.
 */
import { useEffect, useRef, useState } from "react";
import { getMemory, setMemory } from "@/lib/ai-memory";
import { cn } from "@/lib/utils";

const KEY = "first_launch_video_seen" as never;
const VIDEO_SRC = "/intro-video.mp4";
const POSTER_SRC = "/logo.svg";

export function IntroVideo() {
  const [state, setState] = useState<"loading" | "playing" | "done">("loading");
  const [fadeOut, setFadeOut] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Decide whether to show at all
  useEffect(() => {
    (async () => {
      // Respect reduced-motion preference
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const seen = await getMemory<boolean>(KEY);
      if (seen || prefersReduced) {
        setState("done");
        return;
      }
      setState("playing");
    })();
  }, []);

  const finish = async () => {
    setFadeOut(true);
    try {
      await setMemory(KEY, true);
    } catch {
      /* ignore */
    }
    setTimeout(() => setState("done"), 350);
  };

  if (state === "done") return null;
  if (state === "loading") return null; // silent — avoid any flash before decision

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] grid place-items-center bg-background transition-opacity duration-300",
        fadeOut ? "opacity-0" : "opacity-100",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Viora intro"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
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
        onClick={finish}
        className="absolute top-[calc(env(safe-area-inset-top)+16px)] right-4 rounded-full border border-white/20 bg-black/50 px-4 py-1.5 text-[13px] font-semibold text-white backdrop-blur-md active:scale-95"
      >
        דלג
      </button>
    </div>
  );
}
