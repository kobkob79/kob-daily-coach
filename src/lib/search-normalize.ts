/**
 * Shared, pure text normalizer used for exercise search matching.
 *
 * The same normalization must be applied to both the user's query (needle)
 * and the searchable text (haystack) so that Hebrew/English variants that
 * differ only by case, quote style, dash style, or whitespace still match.
 * Intentionally no fuzzy/typo-tolerant matching.
 */
export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[’‘`׳]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/[־‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ");
}

/** Splits a normalized query into non-empty whitespace-separated words. */
export function normalizedSearchWords(value: string | null | undefined): string[] {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}
