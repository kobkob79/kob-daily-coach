import { format } from "date-fns";

export function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function fmt(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}
