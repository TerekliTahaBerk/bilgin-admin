/**
 * Resource ids that end up in a backend path must be proven numeric before any
 * interpolation. A string is never placed into a URL directly: traversal
 * (`1/../../me`), query injection (`1?x=y`) and precision loss on oversized
 * integers all have to fail here rather than reach the backend.
 */
export function parseResourceId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string" || !/^[1-9][0-9]{0,15}$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Stricter than `parseResourceId`: only a real number passes. Route params
 * arrive as strings and are normalised at the edge with `parseResourceId`;
 * everything downstream of that edge is typed `number`, so a string reaching
 * here means a layer was skipped.
 */
export function requireResourceId(value: number): number {
  if (typeof value !== "number" || parseResourceId(value) === null) {
    throw new TypeError("A positive, safe integer resource id is required.");
  }

  return value;
}
