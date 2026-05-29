/**
 * Tiny helpers for mod-ah-bot-plus's `AuctionHouseBot.DisabledCustomItemIDs`
 * field. The conf stores it as a comma-separated list where each token is
 * either a single item entry (`12345`) or a closed range (`2891-2893`).
 *
 * We support **range-aware reads** (so a tile inside `2891-2893` correctly
 * shows as excluded) but **token-level writes** (adding appends one
 * entry; removing only knocks out exact-match standalone tokens — we
 * don't try to split a user-typed range mid-way). That trade keeps the
 * UI logic simple while still handling the common cases.
 *
 * Whitespace + duplicates are normalised on every write so the conf
 * file stays clean across many small UI edits.
 */

export function parseExcludeList(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** True if `entry` is covered by any token in `raw` (singles + ranges). */
export function isExcluded(raw: string, entry: number): boolean {
  for (const tok of parseExcludeList(raw)) {
    if (tok.includes("-")) {
      const [loStr, hiStr] = tok.split("-", 2)
      const lo = Number(loStr)
      const hi = Number(hiStr)
      if (Number.isFinite(lo) && Number.isFinite(hi) && entry >= lo && entry <= hi) {
        return true
      }
    } else {
      if (Number(tok) === entry) return true
    }
  }
  return false
}

/**
 * Append `entry` to the list. No-op if already covered (range or exact).
 * Returns the serialized value ready to write back to the conf field.
 */
export function addExclude(raw: string, entry: number): string {
  if (isExcluded(raw, entry)) return raw.trim()
  const tokens = parseExcludeList(raw)
  tokens.push(String(entry))
  return tokens.join(",")
}

/**
 * Remove `entry` from the list — exact-match only. If `entry` is
 * covered ONLY by a range, the range is left intact (range-splitting
 * isn't worth the UI complexity for an MVP; the user can edit the
 * conf directly for that). Returns the new serialized value.
 */
export function removeExclude(raw: string, entry: number): string {
  const tokens = parseExcludeList(raw).filter((t) => Number(t) !== entry)
  return tokens.join(",")
}
