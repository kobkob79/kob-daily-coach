import { cn } from "@/lib/utils";

interface VioraLogoProps {
  className?: string;
  /** When true, uses gradient background badge; otherwise renders the mark in currentColor. */
  badge?: boolean;
  title?: string;
}

/**
 * Viora brand mark. A rounded chevron "V" crowned by a pulse dot —
 * evokes medical (pulse) + AI direction (vector). Uses currentColor
 * in mono mode so it works on any surface.
 */
export function VioraLogo({ className, badge = true, title = "Viora" }: VioraLogoProps) {
  if (badge) {
    return (
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label={title}
        className={cn("block", className)}
      >
        <defs>
          <linearGradient id="viora-logo-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4CC9F0" />
            <stop offset="1" stopColor="#B47CFF" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#viora-logo-bg)" />
        <path
          d="M18 22 L32 46 L46 22"
          fill="none"
          stroke="#0A0F1C"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="17" r="3.2" fill="#0A0F1C" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn("block", className)}
    >
      <path
        d="M18 22 L32 46 L46 22"
        fill="none"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="17" r="3.2" fill="currentColor" />
    </svg>
  );
}
