import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
  className?: string;
}

export function ProgressRing({
  value,
  size = 88,
  stroke = 8,
  label,
  sub,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * clamped;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={stroke}
          opacity={0.5}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-lg font-bold leading-none">{label}</span>}
        {sub && <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

interface LinearProgressProps {
  value: number; // 0..1
  className?: string;
}

export function LinearProgress({ value, className }: LinearProgressProps) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted/60", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
      />
    </div>
  );
}
