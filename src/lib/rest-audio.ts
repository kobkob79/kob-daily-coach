/**
 * rest-audio — one shared, gesture-unlocked WebAudio context for the rest
 * timer chime.
 *
 * Mobile browsers only allow an AudioContext to produce sound if it was
 * created/resumed inside a user gesture. Creating it lazily at zero (when no
 * gesture is happening) leaves it "suspended" and the chime is silent.
 * So we `prepareRestAudio()` from real gestures (starting a rest, enabling
 * sound) and reuse that single context forever — no leaks, no re-creation.
 */

let ctx: AudioContext | null = null;

type AudioCtor = typeof AudioContext;

function ctor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ??
    null
  );
}

/** Create (once) and resume the shared context. Safe to call on every gesture. */
export function prepareRestAudio(): void {
  try {
    const Ctor = ctor();
    if (!Ctor) return;
    if (!ctx) {
      ctx = new Ctor();
      // Silent tick: some browsers require actual output during the gesture
      // before they consider the context genuinely unlocked.
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    /* audio is best-effort */
  }
}

/** Short three-tone chime. No-op when audio is still blocked by the browser. */
export function playRestChime(): void {
  try {
    if (!ctx) {
      // Never unlocked (no gesture yet) — try anyway, may be silent.
      prepareRestAudio();
      if (!ctx) return;
    }
    const audio = ctx;
    const fire = () => {
      const now = audio.currentTime;
      [880, 1174, 880].forEach((freq, i) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.18);
        gain.gain.linearRampToValueAtTime(0.22, now + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.16);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.18);
      });
    };
    if (audio.state === "suspended") {
      void audio
        .resume()
        .then(fire)
        .catch(() => {});
    } else {
      fire();
    }
  } catch {
    /* ignore */
  }
}
