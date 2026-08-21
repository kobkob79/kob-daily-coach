import { buildLabel } from "@/lib/build-info";
import { cn } from "@/lib/utils";

export function BuildInfo({
  showPrefix = false,
  className,
}: {
  showPrefix?: boolean;
  className?: string;
}) {
  return (
    <p className={cn("text-[10px] leading-4 text-muted-foreground", className)}>
      {showPrefix ? "Version: " : ""}
      <span dir="ltr" className="inline-block tabular-nums">
        {buildLabel}
      </span>
    </p>
  );
}
