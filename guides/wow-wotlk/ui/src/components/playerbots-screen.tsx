import * as React from "react"
import {
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  RobotIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollProgress } from "@/components/ui/scroll-progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CLASS_COLOR_HEX,
  CLASS_COLORS,
  CLASS_ICON_NAMES,
  CLASS_NAMES,
  RACE_NAMES,
} from "@/lib/wow-character-enums"
import { trackedInvoke, isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"

/**
 * Player Bots browser. v1 is read-only — it surfaces the two bot
 * populations the Playerbots mod manages so the user can see what's
 * actually in the world before we hand them the controls.
 *
 * Tabs:
 *   - "In the world" → bot_type=1 (RNDBot). The ~200 random bots
 *     roaming level-appropriate zones. They live their own lives.
 *   - "For your party" → bot_type=2 (AddClass). The 500-strong invite
 *     pool, ready to follow the user. .playerbots bot addclass pulls
 *     from here.
 *
 * Actions (invite / summon / refresh / levelup) land in a follow-up
 * phase once we've clicked around and decided what feels right per
 * tab. No SOAP calls yet.
 */

type Playerbot = {
  guid: number
  name: string
  race: number
  class: number
  gender: number
  level: number
  map: number
  zone: number
  account: number
  botType: 1 | 2
}

type TabId = "world" | "party"

const TABS: { id: TabId; label: string; botType: 1 | 2; description: string }[] = [
  {
    id: "world",
    label: "In the world",
    botType: 1,
    description:
      "Random bots living in the world. They roam level-appropriate zones on their own and won't follow you unless you go fetch them.",
  },
  {
    id: "party",
    label: "For your party",
    botType: 2,
    description:
      "Pre-leveled bots waiting to be recruited. Use these to fill out a group — pick a class and they'll join you instantly.",
  },
]

const CLASS_FILTER_OPTIONS = [
  { value: "0", label: "All classes" },
  ...Object.entries(CLASS_NAMES).map(([id, name]) => ({
    value: id,
    label: name,
  })),
]

const LEVEL_OPTIONS = [
  { value: "0", label: "Any level" },
  { value: "20", label: "Level 20+" },
  { value: "40", label: "Level 40+" },
  { value: "60", label: "Level 60+" },
  { value: "70", label: "Level 70+" },
  { value: "80", label: "Level 80" },
]

export function PlayerbotsScreen() {
  const [bots, setBots] = React.useState<Playerbot[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [activeTab, setActiveTab] = React.useState<TabId>("party")
  const [search, setSearch] = React.useState("")
  const [classFilter, setClassFilter] = React.useState("0")
  const [levelMin, setLevelMin] = React.useState("0")

  // Drives the gradient bar between header and list. Same pattern as
  // Settings / Item Database.
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const refresh = React.useCallback(async () => {
    if (!isTauri()) return
    setLoading(true)
    setLoadError(null)
    try {
      const list = await trackedInvoke<Playerbot[]>("list_playerbots")
      setBots(list)
    } catch (err) {
      setLoadError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const activeBotType = TABS.find((t) => t.id === activeTab)!.botType

  // Filter chain: bot_type → name search → class → level floor.
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const cls = parseInt(classFilter, 10)
    const lvl = parseInt(levelMin, 10)
    return bots.filter((b) => {
      if (b.botType !== activeBotType) return false
      if (q && !b.name.toLowerCase().includes(q)) return false
      if (cls !== 0 && b.class !== cls) return false
      if (lvl !== 0 && b.level < lvl) return false
      return true
    })
  }, [bots, activeBotType, search, classFilter, levelMin])

  // Lazy render — same pattern as TeleportScreen. 700 rows fit but
  // mounting them all at once was the prior pain point.
  const PAGE_SIZE = 60
  const [shown, setShown] = React.useState(PAGE_SIZE)
  React.useEffect(() => {
    setShown(PAGE_SIZE)
  }, [activeTab, search, classFilter, levelMin, bots])
  const paged = React.useMemo(() => filtered.slice(0, shown), [filtered, shown])
  const onListScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      if (
        el.scrollHeight - el.scrollTop - el.clientHeight < 320 &&
        shown < filtered.length
      ) {
        setShown((n) => Math.min(n + PAGE_SIZE, filtered.length))
      }
    },
    [shown, filtered.length]
  )

  const tabDescription = TABS.find((t) => t.id === activeTab)!.description
  const totalForTab = bots.filter((b) => b.botType === activeBotType).length

  return (
    <div className="grid h-full grid-rows-[auto_auto_minmax(0,1fr)] gap-4 p-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold leading-tight">
              <RobotIcon className="size-6 shrink-0 text-muted-foreground" />
              Player Bots
            </h1>
            <p className="text-sm text-muted-foreground">
              Browse the bots Playerbots maintains for you. Random bots
              live in the world and roam on their own; party bots are a
              pre-leveled pool waiting to be invited.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <ArrowClockwiseIcon
              className={cn("size-4", loading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        <BotTypeTabs
          active={activeTab}
          onChange={setActiveTab}
          counts={countByType(bots)}
        />

        <p className="text-xs text-muted-foreground">{tabDescription}</p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bot name…"
              className="pl-9"
            />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLASS_FILTER_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={levelMin} onValueChange={setLevelMin}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_OPTIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <ScrollProgress
        containerRef={scrollRef}
        className="relative h-[3px] w-full rounded-full"
      />

      <div
        ref={scrollRef}
        className="min-h-0 overflow-y-auto pr-1 pb-3"
        onScroll={onListScroll}
      >
        {loadError ? (
          <ErrorPanel message={loadError} onRetry={refresh} />
        ) : loading && bots.length === 0 ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <EmptyState
            hasQuery={
              search.trim().length > 0 ||
              classFilter !== "0" ||
              levelMin !== "0"
            }
            totalForTab={totalForTab}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paged.map((bot) => (
                <BotTile key={bot.guid} bot={bot} />
              ))}
            </div>
            <div className="py-3 text-center text-xs text-muted-foreground">
              {shown < filtered.length
                ? `Showing ${paged.length} of ${filtered.length} — scroll for more`
                : `${filtered.length} bot${filtered.length === 1 ? "" : "s"}`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function countByType(bots: Playerbot[]): Record<TabId, number> {
  let world = 0
  let party = 0
  for (const b of bots) {
    if (b.botType === 1) world++
    else if (b.botType === 2) party++
  }
  return { world, party }
}

function BotTypeTabs({
  active,
  onChange,
  counts,
}: {
  active: TabId
  onChange: (id: TabId) => void
  counts: Record<TabId, number>
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-muted/30 p-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
            active === t.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {t.id === "world" ? (
            <RobotIcon className="size-3.5" />
          ) : (
            <UsersThreeIcon className="size-3.5" />
          )}
          {t.label}
          <span
            className={cn(
              "rounded-full px-1.5 py-0 text-[10px]",
              active === t.id
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {counts[t.id]}
          </span>
        </button>
      ))}
    </div>
  )
}

function BotTile({ bot }: { bot: Playerbot }) {
  const className = CLASS_NAMES[bot.class] ?? `#${bot.class}`
  const raceName = RACE_NAMES[bot.race] ?? `#${bot.race}`
  const classColor = CLASS_COLORS[bot.class] ?? "text-foreground"
  const iconName = CLASS_ICON_NAMES[bot.class]
  const ringColor = CLASS_COLOR_HEX[bot.class] ?? "#888"
  return (
    <div className="group flex items-center gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/40">
      <div
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border-2 bg-muted"
        style={{ borderColor: ringColor }}
      >
        {iconName ? (
          <img
            src={`https://wow.zamimg.com/images/wow/icons/medium/${iconName}.jpg`}
            alt={className}
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          <RobotIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm font-semibold leading-tight",
            classColor
          )}
          title={bot.name}
        >
          {bot.name}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          Lv {bot.level} {raceName} {className}
          {" · "}
          <span className="font-mono">
            map {bot.map}/zone {bot.zone}
          </span>
        </div>
      </div>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-2 pb-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-md border border-border bg-muted/30"
        />
      ))}
    </div>
  )
}

function EmptyState({
  hasQuery,
  totalForTab,
}: {
  hasQuery: boolean
  totalForTab: number
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 p-12 text-center text-sm text-muted-foreground">
      <RobotIcon className="size-8" />
      <div>
        {hasQuery
          ? "No bots match these filters."
          : totalForTab === 0
            ? "No bots in this tab yet — the Playerbots mod hasn't spawned any."
            : "Loading bots…"}
      </div>
    </div>
  )
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600 dark:text-rose-400">
      <div className="font-medium">Couldn't load Player Bots</div>
      <div className="mt-1 text-xs">{message}</div>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
