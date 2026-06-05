/**
 * Parse a single-range HTTP `Range: bytes=...` header against a known size.
 * Supports `bytes=start-end`, `bytes=start-` and the suffix form `bytes=-N`.
 * Returns null when the header is absent / multi-range / syntactically off (the
 * caller should then serve the full body); returns "unsatisfiable" when the
 * range is valid syntax but outside the resource (caller replies 416).
 *
 * Pure (no I/O) so it's unit-testable in isolation.
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // Suffix: last N bytes.
    const n = parseInt(rawEnd, 10);
    if (n <= 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(rawStart, 10);
    end = rawEnd === "" ? size - 1 : Math.min(parseInt(rawEnd, 10), size - 1);
  }
  if (start > end || start >= size) return "unsatisfiable";
  return { start, end };
}
