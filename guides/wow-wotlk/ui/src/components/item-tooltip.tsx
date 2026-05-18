import * as React from "react"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { ItemIconFramed } from "@/components/item-icon-framed"
import { trackedInvoke, isTauri } from "@/lib/tauri"
import {
  BONDING_LABELS,
  DAMAGE_TYPE_LABELS,
  INVENTORY_TYPE_LABELS,
  SPELL_TRIGGER_LABELS,
  STAT_TYPE_LABELS,
  formatMoney,
  itemTypeLabel,
} from "@/lib/wow-item-enums"
import { cn } from "@/lib/utils"

/**
 * Wowhead-style item tooltip popover. Mimics the in-game WoW tooltip:
 * quality-colored name, yellow ilvl line, white attribute lines,
 * green Equip/Use/Chance-on-hit prose, gold/silver/copper sell price.
 *
 * Triggered on hover (mirrors WoW's in-game behavior). Wraps any
 * arbitrary trigger element via `children`. The trigger receives a
 * click no-op so it can still drive other actions (e.g. an existing
 * "Send" button in the row).
 *
 * Data flow:
 *   - Lazy-fetch `get_item_details(entry)` on first hover; cache per
 *     entry id in a module-level Map (one fetch per item per session).
 *   - Spell descriptions come from the tooltip-data cache the user
 *     extracted via Settings; if not loaded, those rows just skip
 *     (we don't block the tooltip waiting for enrichment).
 *
 * Usage:
 *   <ItemTooltip entry={item.entry} iconMap={iconMap} tooltipData={tt}>
 *     <ItemIconFramed iconName={...} entry={...} />
 *   </ItemTooltip>
 */

// Mirror of the inventory::ItemDetails Rust struct.
export type ItemDetails = {
  entry: number
  name: string
  quality: number
  displayId: number
  bonding: number
  flags: number
  itemLevel: number
  requiredLevel: number
  inventoryType: number
  class: number
  subclass: number
  maxCount: number
  maxDurability: number
  armor: number
  dmgMin1: number
  dmgMax1: number
  dmgType1: number
  dmgMin2: number
  dmgMax2: number
  dmgType2: number
  delay: number
  holyRes: number
  fireRes: number
  natureRes: number
  frostRes: number
  shadowRes: number
  arcaneRes: number
  stats: { statType: number; value: number }[]
  spells: { spellId: number; trigger: number; cooldownMs: number }[]
  itemSet: number
  sellPrice: number
  description: string
}

type SpellEntry = {
  name: string
  description: string
  aura_description: string
  icon: string
}

type ItemSetEntry = {
  name: string
  items: number[]
  bonuses: { threshold: number; spell_id: number }[]
}

type TooltipData = {
  spells: Record<string, SpellEntry>
  sets: Record<string, ItemSetEntry>
}

// Quality color palette — mirrors the inventory grid + ItemIconFramed.
const QUALITY_COLORS: Record<number, string> = {
  0: "text-zinc-400",
  1: "text-white",
  2: "text-green-400",
  3: "text-blue-400",
  4: "text-violet-400",
  5: "text-orange-400",
  6: "text-amber-300",
  7: "text-cyan-400",
}

// Module-level details cache so re-hovering an item is instant. Cleared
// on full reload; that's intentional — fresh server data on app restart.
const detailsCache: Map<number, ItemDetails> = new Map()
const inflight: Map<number, Promise<ItemDetails>> = new Map()

async function loadItemDetails(entry: number): Promise<ItemDetails> {
  const cached = detailsCache.get(entry)
  if (cached) return cached
  const existing = inflight.get(entry)
  if (existing) return existing

  const p = (async () => {
    const result = await trackedInvoke<ItemDetails>("get_item_details", {
      entry,
    })
    detailsCache.set(entry, result)
    inflight.delete(entry)
    return result
  })()
  inflight.set(entry, p)
  return p
}

export function ItemTooltip({
  entry,
  iconMap,
  tooltipData,
  children,
  side = "right",
  align = "start",
}: {
  entry: number
  /** displayid → icon-name map from the icon-cache enrichment. */
  iconMap?: Record<string, string>
  /** Full tooltip-cache from Settings enrichment (optional). When
   * absent, spell/set lines are skipped. */
  tooltipData?: TooltipData | null
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}) {
  const [details, setDetails] = React.useState<ItemDetails | null>(
    () => detailsCache.get(entry) ?? null
  )
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  // Fetch on first open. We DON'T pre-fetch on mount — there can be
  // 100+ items on the page and that'd hammer the DB for tooltips the
  // user may never look at.
  React.useEffect(() => {
    if (!open || details || !isTauri()) return
    let cancelled = false
    loadItemDetails(entry)
      .then((d) => {
        if (!cancelled) setDetails(d)
      })
      .catch((e) => {
        if (!cancelled) setError(typeof e === "string" ? e : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [open, details, entry])

  return (
    <HoverCard
      openDelay={150}
      closeDelay={80}
      open={open}
      onOpenChange={setOpen}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        // Replace shadcn's default popover skin with the WoW tooltip
        // look — near-black bg with a faint warm-tone border, no
        // rounded corners feel, generous padding, monospace-free.
        className="w-[320px] rounded-md border border-[#3a2f1e] bg-[#0a0a14]/95 p-3 text-[12.5px] leading-snug text-white shadow-2xl backdrop-blur"
      >
        {error ? (
          <div className="text-rose-400">{error}</div>
        ) : details ? (
          <TooltipBody
            details={details}
            iconMap={iconMap}
            tooltipData={tooltipData}
          />
        ) : (
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="size-3 animate-pulse rounded-full bg-zinc-600" />
            Loading…
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

function TooltipBody({
  details,
  iconMap,
  tooltipData,
}: {
  details: ItemDetails
  iconMap?: Record<string, string>
  tooltipData?: TooltipData | null
}) {
  const quality = QUALITY_COLORS[details.quality] ?? "text-white"
  const slot = INVENTORY_TYPE_LABELS[details.inventoryType] ?? ""
  const type = itemTypeLabel(details.class, details.subclass)
  const bondingText = BONDING_LABELS[details.bonding] ?? ""
  const isUnique = details.maxCount === 1
  const iconName = iconMap?.[String(details.displayId)] ?? null

  // Damage line. dmg_type=0 means physical → just "Damage"; >0 is an
  // elemental suffix ("Nature Damage" etc.). Secondary damage line
  // (dmg_min2/max2) is shown with a leading "+" like Thunderfury.
  const hasDamage1 = details.dmgMax1 > 0
  const hasDamage2 = details.dmgMax2 > 0
  const speed = details.delay / 1000

  // DPS calculation matches the in-game formula: average of all
  // damage ranges / attack time.
  const dps = React.useMemo(() => {
    if (!hasDamage1 && !hasDamage2) return null
    const avg1 = hasDamage1 ? (details.dmgMin1 + details.dmgMax1) / 2 : 0
    const avg2 = hasDamage2 ? (details.dmgMin2 + details.dmgMax2) / 2 : 0
    if (!speed) return null
    return (avg1 + avg2) / speed
  }, [details, hasDamage1, hasDamage2, speed])

  // Resistances — only show non-zero. The four most common (fire/
  // nature/frost/shadow) line up with the order WoW renders them.
  const resistances: { label: string; value: number }[] = []
  for (const [label, value] of [
    ["Arcane", details.arcaneRes],
    ["Fire", details.fireRes],
    ["Nature", details.natureRes],
    ["Frost", details.frostRes],
    ["Shadow", details.shadowRes],
    ["Holy", details.holyRes],
  ] as const) {
    if (value !== 0) resistances.push({ label, value })
  }

  const setEntry = details.itemSet
    ? tooltipData?.sets?.[String(details.itemSet)]
    : undefined

  const money = formatMoney(details.sellPrice)
  const showMoney = details.sellPrice > 0

  return (
    <div className="flex gap-3">
      {/* Top-left icon — mirrors how Wowhead lays out the in-tooltip
          icon next to the right-rail metadata. */}
      <ItemIconFramed
        iconName={iconName}
        entry={details.entry}
        quality={details.quality}
        size="large"
      />

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("text-[14px] font-semibold leading-tight", quality)}>
            {details.name}
          </div>
          {/* Phase indicator — WoW shows "Phase 1" for vanilla items.
              Hardcoded for now; future work could map item ranges to
              expansion phases like Wowhead does. */}
          <div className="shrink-0 text-right text-[10px] leading-tight text-zinc-400">
            <div>Phase</div>
            <div>1</div>
          </div>
        </div>
        {details.itemLevel > 0 && (
          <div className="text-[#ffd200]">Item Level {details.itemLevel}</div>
        )}
        {bondingText && <div>{bondingText}</div>}
        {isUnique && <div>Unique</div>}

        {/* Slot + type row, justify-between like the in-game tooltip. */}
        {(slot || type) && (
          <div className="flex justify-between gap-3">
            <span>{slot}</span>
            {type && <span>{type}</span>}
          </div>
        )}

        {/* Damage block. Two-line damage (Thunderfury-style) uses the
            "+ A - B Element Damage" form for the second line. */}
        {hasDamage1 && (
          <div className="flex justify-between gap-3">
            <span>
              {damageLine(details.dmgMin1, details.dmgMax1, details.dmgType1, false)}
            </span>
            {speed > 0 && (
              <span>Speed {speed.toFixed(2).replace(/\.?0+$/, "")}</span>
            )}
          </div>
        )}
        {hasDamage2 && (
          <div>
            {damageLine(details.dmgMin2, details.dmgMax2, details.dmgType2, true)}
          </div>
        )}
        {dps != null && (
          <div className="text-zinc-300">
            ({dps.toFixed(2)} damage per second)
          </div>
        )}

        {/* Armor (for armor items). */}
        {details.armor > 0 && <div>{details.armor.toLocaleString()} Armor</div>}

        {/* Stat block — +N STAT lines. Item ordering is preserved
            since stat_type1..10 in the schema is meaningful. */}
        {details.stats.map((s, i) => (
          <div key={i}>
            {s.value >= 0 ? "+" : ""}
            {s.value} {STAT_TYPE_LABELS[s.statType] ?? `Stat ${s.statType}`}
          </div>
        ))}

        {/* Resistance lines, only non-zero ones. */}
        {resistances.map((r) => (
          <div key={r.label}>
            {r.value >= 0 ? "+" : ""}
            {r.value} {r.label} Resistance
          </div>
        ))}

        {details.maxDurability > 0 && (
          <div>
            Durability {details.maxDurability} / {details.maxDurability}
          </div>
        )}

        {details.requiredLevel > 0 && (
          <div>Requires Level {details.requiredLevel}</div>
        )}

        {/* Spell-attached lines: Equip:/Use:/Chance on hit:. Pulls
            prose from the tooltip cache; if the cache hasn't been
            extracted yet we skip these silently. */}
        {details.spells.map((s, i) => {
          const spell = tooltipData?.spells?.[String(s.spellId)]
          if (!spell?.description) return null
          const verb = SPELL_TRIGGER_LABELS[s.trigger] ?? "Equip"
          const cd =
            s.trigger === 0 && s.cooldownMs > 0
              ? ` (${Math.round(s.cooldownMs / 1000)} sec cooldown)`
              : ""
          return (
            <div key={i} className="text-green-400">
              {verb}: {spell.description}
              {cd}
            </div>
          )
        })}

        {/* Item set lines: name, member items (gray when not equipped
            — we don't know equipment state so always gray), then
            (N): bonus-description lines. */}
        {setEntry && (
          <div className="mt-1 space-y-0.5 border-t border-white/10 pt-1">
            <div className="text-yellow-300">{setEntry.name}</div>
            {setEntry.items.length > 0 && (
              <div className="text-zinc-500">
                {setEntry.items.map((id) => (
                  <div key={id} className="pl-2">
                    · Item #{id}
                  </div>
                ))}
              </div>
            )}
            {setEntry.bonuses.map((b, i) => {
              const spell = tooltipData?.spells?.[String(b.spell_id)]
              return (
                <div key={i} className="text-zinc-400">
                  ({b.threshold}) Set:{" "}
                  {spell?.description ?? `Spell ${b.spell_id}`}
                </div>
              )
            })}
          </div>
        )}

        {/* Flavor text — italic yellow, classic WoW formatting. */}
        {details.description && (
          <div className="italic text-[#ffd200]">"{details.description}"</div>
        )}

        {/* Sell price as gold/silver/copper. Hidden when item has no
            vendor price (quest items etc.). */}
        {showMoney && (
          <div className="flex items-center gap-1">
            <span>Sell Price:</span>
            {money.gold > 0 && <Coin amount={money.gold} kind="gold" />}
            {money.silver > 0 && <Coin amount={money.silver} kind="silver" />}
            {(money.copper > 0 || (money.gold === 0 && money.silver === 0)) && (
              <Coin amount={money.copper} kind="copper" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function damageLine(min: number, max: number, type: number, secondary: boolean): string {
  const element = DAMAGE_TYPE_LABELS[type] ?? ""
  const elementStr = element ? `${element} ` : ""
  const range = `${Math.round(min)} - ${Math.round(max)}`
  return secondary
    ? `+ ${range} ${elementStr}Damage`.trim()
    : `${range} ${elementStr}Damage`.trim()
}

/**
 * Inline copper/silver/gold coin. We don't have real coin sprites
 * extracted yet; for v1 we use Tailwind to draw a colored circle with
 * a single-letter label. Swap for proper sprites later.
 */
function Coin({
  amount,
  kind,
}: {
  amount: number
  kind: "gold" | "silver" | "copper"
}) {
  const ringColor =
    kind === "gold"
      ? "bg-amber-400 text-amber-950"
      : kind === "silver"
        ? "bg-zinc-300 text-zinc-800"
        : "bg-orange-700 text-orange-200"
  return (
    <span className="inline-flex items-center gap-0.5">
      <span>{amount}</span>
      <span
        className={cn(
          "inline-flex size-3.5 items-center justify-center rounded-full text-[8px] font-bold",
          ringColor
        )}
        aria-hidden
      >
        {kind[0].toUpperCase()}
      </span>
    </span>
  )
}
