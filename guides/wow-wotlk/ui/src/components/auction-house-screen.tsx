import * as React from "react"
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  GavelIcon,
  InfoIcon,
  StorefrontIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useServerState } from "@/components/server-state-context"
import { trackedInvoke, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"

const MODULE_KEY = "mod-ah-bot-plus"

/**
 * Auction House Bot configuration page.
 *
 * Two tabs:
 *   - **Basic** — ~8 cards covering the 80% of settings most users
 *     ever touch (seller/buyer toggles, cycle frequency, faction stock,
 *     buyout cap, listing duration).
 *   - **Advanced** — the long tail (440+ knobs) grouped by the conf
 *     file's section ordering. Lands in a later iteration; for now
 *     surfaces an "available soon" hint so users know where to find
 *     the granular knobs.
 *
 * Save flow: the page loads field values from
 * `installedModules[mod-ah-bot-plus].conf`, the user mutates a local
 * draft, and the Save button (across from the tabs) goes from grey
 * (clean) → green (dirty). Clicking Save writes every changed field
 * to the active conf via `update_module_conf`, then issues a SOAP
 * `.ahbot reload` so the worldserver picks up the new values without
 * a full restart.
 */
export function AuctionHouseScreen() {
  const { installedModules, refreshInstalledModules } = useServerState()
  const ahbot = React.useMemo(
    () => installedModules.find((m) => m.key === MODULE_KEY),
    [installedModules]
  )

  // ── Load + draft state ──────────────────────────────────────────────
  // The draft is the editable working copy; `loaded` is the snapshot we
  // diff against to compute the dirty flag. We re-seed both whenever the
  // module config changes from outside (e.g., a fresh install, a manual
  // refresh, or the Item Database gavel writing exclude IDs in the
  // background).
  const [loaded, setLoaded] = React.useState<Record<string, string>>({})
  const [draft, setDraft] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    if (!ahbot) return
    setLoaded({ ...ahbot.conf })
    setDraft({ ...ahbot.conf })
  }, [ahbot])

  const setField = (key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  // Dirty = any field present in draft whose value differs from loaded.
  // We don't enumerate every conf key — only the ones the user touched
  // (the Basic tab covers ~12). Untouched keys silently pass through.
  const dirty = React.useMemo(() => {
    for (const k of Object.keys(draft)) {
      if (draft[k] !== loaded[k]) return true
    }
    return false
  }, [draft, loaded])

  // ── Save flow ───────────────────────────────────────────────────────
  const [saving, setSaving] = React.useState(false)
  const handleSave = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      // Only send fields that actually changed. The Rust side runs
      // conf_set_inplace per pair which is idempotent, but sending only
      // diffs keeps the conf file's history clean.
      const changed: Record<string, string> = {}
      for (const k of Object.keys(draft)) {
        if (draft[k] !== loaded[k]) changed[k] = draft[k]
      }
      if (isTauri()) {
        await trackedInvoke("update_module_conf", {
          moduleKey: MODULE_KEY,
          fields: changed,
        })
        // Hot-reload the bot's config so new auctions on the next
        // cycle use the new rules — no worldserver restart needed.
        await trackedInvoke<string>("reload_ahbot")
      }
      await refreshInstalledModules()
      // refreshInstalledModules re-seeds `loaded` via the effect above;
      // explicit reset here just covers the (non-Tauri) preview path.
      setLoaded({ ...draft })
      toast.success("Auction House settings saved", {
        description: "New rules apply on the next bot cycle (~1 min).",
      })
    } catch (err) {
      toast.error("Couldn't save", {
        description: String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  if (!ahbot) {
    return <NotInstalledState />
  }

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-4 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold leading-tight">
          <GavelIcon className="size-6 shrink-0 text-muted-foreground" />
          Auction House
        </h1>
        <p className="text-sm text-muted-foreground">
          Tune what your server's bot lists, how often it cycles, and
          which auction houses it stocks. Changes apply on the next bot
          cycle without restarting the worldserver.
        </p>
      </header>

      <Tabs defaultValue="basic" className="min-h-0 gap-4">
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          <SaveButton dirty={dirty} saving={saving} onSave={handleSave} />
        </div>

        <TabsContent value="basic" className="min-h-0 overflow-y-auto pr-1 pb-3">
          <BasicTab draft={draft} setField={setField} />
        </TabsContent>

        <TabsContent
          value="advanced"
          className="min-h-0 overflow-y-auto pr-1 pb-3"
        >
          <AdvancedTab draft={draft} setField={setField} loaded={loaded} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Save button ────────────────────────────────────────────────────────
function SaveButton({
  dirty,
  saving,
  onSave,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
}) {
  return (
    <Button
      size="sm"
      onClick={onSave}
      disabled={!dirty || saving}
      className={cn(
        // Grey when clean (matches `disabled` state); green when dirty
        // so the call-to-action stands out across from the tab bar.
        dirty
          ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
          : undefined
      )}
    >
      {saving ? (
        <>
          <ArrowClockwiseIcon className="size-3.5 animate-spin" />
          Saving…
        </>
      ) : dirty ? (
        <>
          <CheckCircleIcon className="size-3.5" />
          Save changes
        </>
      ) : (
        "Saved"
      )}
    </Button>
  )
}

// ── Basic tab ──────────────────────────────────────────────────────────

/**
 * Pull a value (with fallback) out of the draft. mod-ah-bot-plus stores
 * booleans as the literal strings "true"/"false". Numbers come in as
 * digit strings.
 */
const get = (draft: Record<string, string>, key: string, fallback = "") =>
  draft[key] ?? fallback

const asBool = (v: string) => v.trim().toLowerCase() === "true"

function BasicTab({
  draft,
  setField,
}: {
  draft: Record<string, string>
  setField: (key: string, value: string) => void
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Seller bot */}
      <Card
        title="Seller bot"
        icon={<StorefrontIcon className="size-5" />}
        help="The seller posts auctions on behalf of the AHBOT character. Disable to stop new listings — existing ones expire on their own."
      >
        <BoolRow
          label="Bot lists auctions"
          help="EnableSeller — turn this off if you want to drain the AH without recycling fresh listings."
          value={asBool(get(draft, "AuctionHouseBot.EnableSeller", "false"))}
          onChange={(v) =>
            setField("AuctionHouseBot.EnableSeller", v ? "true" : "false")
          }
        />
        <NumberRow
          label="Listings per cycle"
          help="ItemsPerCycle — how many items the bot lists per cycle. Higher = busier AH, more CPU."
          value={Number(get(draft, "AuctionHouseBot.ItemsPerCycle", "150"))}
          min={50}
          max={2000}
          step={10}
          onChange={(v) =>
            setField("AuctionHouseBot.ItemsPerCycle", String(v))
          }
        />
        <RangeRow
          label="Listing duration"
          help="ListingExpireTimeInSecondsMin/Max — how long each auction stays up. Lower = livelier AH, fewer expired listings filling mail."
          minValue={Number(
            get(draft, "AuctionHouseBot.ListingExpireTimeInSecondsMin", "3600")
          )}
          maxValue={Number(
            get(draft, "AuctionHouseBot.ListingExpireTimeInSecondsMax", "86400")
          )}
          min={900}
          max={172800}
          step={900}
          format={formatSeconds}
          onChange={(lo, hi) => {
            setField("AuctionHouseBot.ListingExpireTimeInSecondsMin", String(lo))
            setField("AuctionHouseBot.ListingExpireTimeInSecondsMax", String(hi))
          }}
        />
      </Card>

      {/* Buyer bot */}
      <Card
        title="Buyer bot"
        icon={<GavelIcon className="size-5" />}
        help="The buyer bids on listings other players post. Gives you reliable buyers in single-player or low-pop servers."
      >
        <BoolRow
          label="Bot bids on listings"
          help="Buyer.Enabled — when on, the bot will bid on or buy out items players list. Off by default."
          value={asBool(
            get(draft, "AuctionHouseBot.Buyer.Enabled", "false")
          )}
          onChange={(v) =>
            setField(
              "AuctionHouseBot.Buyer.Enabled",
              v ? "true" : "false"
            )
          }
        />
        <NumberRow
          label="Items considered per cycle"
          help="Buyer.BuyCandidatesPerBuyCycle — how many listings the bot evaluates each cycle. Higher = faster turnover, more CPU."
          value={Number(
            get(draft, "AuctionHouseBot.Buyer.BuyCandidatesPerBuyCycle", "1")
          )}
          min={1}
          max={50}
          step={1}
          onChange={(v) =>
            setField(
              "AuctionHouseBot.Buyer.BuyCandidatesPerBuyCycle",
              String(v)
            )
          }
        />
        <NumberRow
          label="Max buyout (gold)"
          help="MaxBuyoutPriceInCopper — listings priced above this cap are ignored. Stored in copper; we render and accept gold for readability."
          value={Math.floor(
            Number(
              get(draft, "AuctionHouseBot.MaxBuyoutPriceInCopper", "1000000000")
            ) / 10000
          )}
          min={100}
          max={1_000_000}
          step={100}
          suffix="g"
          onChange={(gold) =>
            setField(
              "AuctionHouseBot.MaxBuyoutPriceInCopper",
              String(Math.round(gold) * 10000)
            )
          }
        />
      </Card>

      {/* Cycle frequency */}
      <Card
        title="Cycle frequency"
        icon={<ArrowClockwiseIcon className="size-5" />}
        help="How often the bot wakes up to act. Higher values reduce server load; lower values keep the AH feeling alive."
      >
        <NumberRow
          label="Minutes between SELL cycles"
          help="MinutesBetweenSellCycle — how often the bot considers listing new items."
          value={Number(
            get(draft, "AuctionHouseBot.MinutesBetweenSellCycle", "1")
          )}
          min={1}
          max={60}
          step={1}
          onChange={(v) =>
            setField("AuctionHouseBot.MinutesBetweenSellCycle", String(v))
          }
        />
        <NumberRow
          label="Minutes between BUY cycles"
          help="MinutesBetweenBuyCycle — how often the buyer considers bidding. Independent from the sell cycle."
          value={Number(
            get(draft, "AuctionHouseBot.MinutesBetweenBuyCycle", "1")
          )}
          min={1}
          max={60}
          step={1}
          onChange={(v) =>
            setField("AuctionHouseBot.MinutesBetweenBuyCycle", String(v))
          }
        />
      </Card>

      {/* Faction houses */}
      <Card
        title="Faction houses"
        icon={<InfoIcon className="size-5" />}
        help="Each faction has its own AH. Set the desired inventory size — the bot tops up to MinItems and won't list past MaxItems."
        wide
      >
        <FactionRow
          label="Alliance"
          draft={draft}
          setField={setField}
          prefix="AuctionHouseBot.Alliance"
        />
        <FactionRow
          label="Horde"
          draft={draft}
          setField={setField}
          prefix="AuctionHouseBot.Horde"
        />
        <FactionRow
          label="Neutral"
          draft={draft}
          setField={setField}
          prefix="AuctionHouseBot.Neutral"
        />
      </Card>
    </div>
  )
}

// ── Reusable Row primitives ────────────────────────────────────────────

function Card({
  title,
  icon,
  help,
  wide,
  children,
}: {
  title: string
  icon: React.ReactNode
  help: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border border-border bg-card p-4",
        wide && "lg:col-span-2"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded bg-muted p-1.5 text-muted-foreground">
          {icon}
        </div>
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold leading-tight">{title}</span>
            <HelpHint text={help} />
          </div>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function HelpHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Help"
          className="text-muted-foreground/60 hover:text-muted-foreground"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

function BoolRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string
  help: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{label}</span>
        <HelpHint text={help} />
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  )
}

function NumberRow({
  label,
  help,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  help: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">{label}</Label>
          <HelpHint text={help} />
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) onChange(n)
            }}
            className="h-7 w-24 text-right text-xs"
          />
          {suffix && (
            <span className="text-xs text-muted-foreground">{suffix}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function RangeRow({
  label,
  help,
  minValue,
  maxValue,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  help: string
  minValue: number
  maxValue: number
  min: number
  max: number
  step: number
  format: (n: number) => string
  onChange: (lo: number, hi: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">{label}</Label>
          <HelpHint text={help} />
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {format(minValue)} – {format(maxValue)}
        </span>
      </div>
      <Slider
        value={[minValue, maxValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          // Slider guarantees a sorted 2-tuple here.
          const [lo, hi] = v as [number, number]
          onChange(lo, hi)
        }}
      />
    </div>
  )
}

function FactionRow({
  label,
  draft,
  setField,
  prefix,
}: {
  label: string
  draft: Record<string, string>
  setField: (key: string, value: string) => void
  prefix: string
}) {
  const minKey = `${prefix}.MinItems`
  const maxKey = `${prefix}.MaxItems`
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 p-2.5">
      <div className="text-xs font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <Label className="text-[10px] uppercase text-muted-foreground">
          Min
        </Label>
        <Input
          type="number"
          value={Number(get(draft, minKey, "15000"))}
          min={0}
          max={50000}
          step={500}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) setField(minKey, String(n))
          }}
          className="h-7 w-20 text-right text-xs"
        />
        <Label className="text-[10px] uppercase text-muted-foreground">
          Max
        </Label>
        <Input
          type="number"
          value={Number(get(draft, maxKey, "15000"))}
          min={0}
          max={50000}
          step={500}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) setField(maxKey, String(n))
          }}
          className="h-7 w-20 text-right text-xs"
        />
      </div>
    </div>
  )
}

// ── Empty + Advanced placeholders ──────────────────────────────────────

function NotInstalledState() {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-md space-y-2">
        <WarningCircleIcon className="mx-auto size-10 text-muted-foreground" />
        <h2 className="text-base font-semibold">Auction House Bot not installed</h2>
        <p className="text-sm text-muted-foreground">
          mod-ah-bot-plus isn't part of this install. Reinstall the
          server with the AH Bot module selected during onboarding to
          enable this page.
        </p>
      </div>
    </div>
  )
}

// ── Advanced tab ───────────────────────────────────────────────────────

/**
 * Section grouping for the Advanced tab. Each rule is a function that
 * decides whether a given conf key belongs to this section. Ordering
 * matters — keys go into the FIRST matching section, so put more
 * specific patterns above general ones.
 *
 * Keys are grouped to mirror the conf file's heading order so power
 * users who know the conf can find things quickly.
 */
const ADVANCED_SECTIONS: { id: string; title: string; match: (k: string) => boolean }[] = [
  {
    id: "core",
    title: "Core",
    // Top-level AuctionHouseBot.X (no second dot after the prefix),
    // plus DEBUG fields.
    match: (k) => {
      if (!k.startsWith("AuctionHouseBot.")) return false
      const tail = k.slice("AuctionHouseBot.".length)
      return !tail.includes(".") || tail.startsWith("DEBUG")
    },
  },
  {
    id: "buyer",
    title: "Buyer properties",
    match: (k) => k.startsWith("AuctionHouseBot.Buyer."),
  },
  {
    id: "factions",
    title: "Faction stock levels",
    match: (k) =>
      k.startsWith("AuctionHouseBot.Alliance.") ||
      k.startsWith("AuctionHouseBot.Horde.") ||
      k.startsWith("AuctionHouseBot.Neutral."),
  },
  {
    id: "complete-overrides",
    title: "Complete item value overrides",
    match: (k) => k.startsWith("AuctionHouseBot.CompleteItemValueOverride"),
  },
  {
    id: "listing-rules",
    title: "Advanced listing rules",
    match: (k) => k.startsWith("AuctionHouseBot.AdvancedListingRules"),
  },
  {
    id: "listed-restrict",
    title: "Listed item restrictions",
    match: (k) =>
      k.startsWith("AuctionHouseBot.ListedItem") ||
      k.startsWith("AuctionHouseBot.EquipItem"),
  },
  {
    id: "disabled",
    title: "Disabled-item lists",
    match: (k) =>
      k.startsWith("AuctionHouseBot.Disabled") ||
      k.startsWith("AuctionHouseBot.DisabledRecipe"),
  },
  {
    id: "advanced-pricing",
    title: "Advanced pricing toggles",
    match: (k) => k.startsWith("AuctionHouseBot.AdvancedPricing"),
  },
  {
    id: "price-multipliers",
    title: "Price multipliers",
    match: (k) =>
      k.startsWith("AuctionHouseBot.PriceMultiplier") ||
      k.startsWith("AuctionHouseBot.PriceMinimumCenterBase"),
  },
  {
    id: "variations",
    title: "Bid + buyout variation",
    match: (k) =>
      k.includes("VariationAdd") ||
      k.includes("VariationReduce") ||
      k.includes("BuyoutBelowVendor"),
  },
  {
    id: "stack",
    title: "Stack sizing",
    match: (k) => k.startsWith("AuctionHouseBot.ListingStack") ||
      k.startsWith("AuctionHouseBot.ListProportion"),
  },
  {
    id: "max-buyout",
    title: "Max buyout",
    match: (k) => k.startsWith("AuctionHouseBot.MaxBuyout"),
  },
  {
    id: "other",
    title: "Other AuctionHouseBot fields",
    match: (k) => k.startsWith("AuctionHouseBot."),
  },
]

function AdvancedTab({
  draft,
  setField,
  loaded,
}: {
  draft: Record<string, string>
  setField: (key: string, value: string) => void
  loaded: Record<string, string>
}) {
  // Bucket every AuctionHouseBot.* key from the LOADED conf into
  // sections. Using `loaded` (not `draft`) means new keys appear only
  // when the conf is refreshed — predictable, no flicker as the user
  // types.
  const sections = React.useMemo(() => {
    const buckets: Record<string, string[]> = Object.fromEntries(
      ADVANCED_SECTIONS.map((s) => [s.id, []])
    )
    const keys = Object.keys(loaded)
      .filter((k) => k.startsWith("AuctionHouseBot."))
      .sort()
    for (const k of keys) {
      for (const section of ADVANCED_SECTIONS) {
        if (section.match(k)) {
          buckets[section.id].push(k)
          break
        }
      }
    }
    return ADVANCED_SECTIONS.filter((s) => buckets[s.id].length > 0).map(
      (s) => ({ ...s, keys: buckets[s.id] })
    )
  }, [loaded])

  if (sections.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No AuctionHouseBot fields found in the loaded conf. Has the
        worldserver started at least once since mod-ah-bot-plus was
        installed?
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          Full surface — every key from{" "}
          <span className="font-mono">mod_ahbot.conf</span>, grouped by
          section. Field types are auto-detected (bool/number/text). Inline
          help text isn't ported yet; the conf file itself has detailed
          comments per setting if you need a definition.
        </span>
      </div>
      <Accordion type="multiple" className="space-y-2">
        {sections.map((s) => (
          <AccordionItem
            key={s.id}
            value={s.id}
            className="rounded-md border border-border bg-card"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-sm font-semibold">{s.title}</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {s.keys.length} field{s.keys.length === 1 ? "" : "s"}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <SectionFields
                keys={s.keys}
                draft={draft}
                loaded={loaded}
                setField={setField}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

function SectionFields({
  keys,
  draft,
  loaded,
  setField,
}: {
  keys: string[]
  draft: Record<string, string>
  loaded: Record<string, string>
  setField: (key: string, value: string) => void
}) {
  return (
    <div className="space-y-2">
      {keys.map((k) => (
        <AdvancedFieldRow
          key={k}
          confKey={k}
          value={draft[k] ?? loaded[k] ?? ""}
          loadedValue={loaded[k] ?? ""}
          onChange={(v) => setField(k, v)}
        />
      ))}
    </div>
  )
}

/**
 * Auto-detect the field's type from its CURRENT VALUE and render the
 * matching control:
 *   - bool: Switch (`true` / `false` literal)
 *   - number: numeric Input
 *   - long/list: stretchy Input
 *   - text: plain Input
 * The dirty indicator (subtle accent on the key) flips when the
 * draft differs from the loaded snapshot.
 */
function AdvancedFieldRow({
  confKey,
  value,
  loadedValue,
  onChange,
}: {
  confKey: string
  value: string
  loadedValue: string
  onChange: (v: string) => void
}) {
  const kind = detectKind(value || loadedValue)
  const dirty = value !== loadedValue
  // Strip the AuctionHouseBot. prefix on the label so the field name is
  // scannable. Hover shows the full key for users who know it.
  const label = confKey.replace(/^AuctionHouseBot\./, "")
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-3 rounded border border-transparent bg-background/40 px-2.5 py-1.5",
        dirty && "border-emerald-500/30 bg-emerald-500/5"
      )}
    >
      <Label
        className="font-mono text-[11px] leading-tight text-foreground/90"
        title={confKey}
      >
        {label}
      </Label>
      <div className="flex items-center gap-2">
        {kind === "bool" ? (
          <Switch
            checked={value.trim().toLowerCase() === "true"}
            onCheckedChange={(v) => onChange(v ? "true" : "false")}
          />
        ) : kind === "number" ? (
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-32 text-right font-mono text-xs"
          />
        ) : (
          <Input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "h-7 font-mono text-xs",
              kind === "long" ? "w-[420px]" : "w-64"
            )}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Heuristic type detection from the current value. Conservative:
 * unknown shapes fall through to plain text. The Long/list bucket is
 * detected by length or comma-presence and just gets a wider input
 * (we don't have a textarea primitive in the kit yet — using Input
 * with overflow keeps things consistent for now).
 */
function detectKind(v: string): "bool" | "number" | "long" | "text" {
  const t = v.trim().toLowerCase()
  if (t === "true" || t === "false") return "bool"
  if (/^-?\d+(\.\d+)?$/.test(t)) return "number"
  if (v.length > 60 || v.includes(",")) return "long"
  return "text"
}

// ── Formatters ─────────────────────────────────────────────────────────
function formatSeconds(s: number): string {
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${(s / 3600).toFixed(1).replace(/\.0$/, "")}h`
  return `${(s / 86400).toFixed(1).replace(/\.0$/, "")}d`
}
