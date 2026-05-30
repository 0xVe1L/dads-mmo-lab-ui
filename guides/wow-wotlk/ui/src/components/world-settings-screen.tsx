import * as React from "react"
import {
  ArrowsClockwiseIcon,
  ChatCircleTextIcon,
  CircleNotchIcon,
  FloppyDiskIcon,
  GlobeHemisphereWestIcon,
  HardDrivesIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  TShirtIcon,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useServerState } from "@/components/server-state-context"
import { isTauri, trackedInvoke } from "@/lib/tauri"
import { cn } from "@/lib/utils"

type WorldTab = "rates" | "server"

/**
 * World Settings — curated player-facing global rates from
 * worldserver.conf. Saving writes the conf and `.reload config`s the
 * worldserver so rates apply without a restart.
 */

interface WorldSettings {
  xpKill: number
  xpQuest: number
  xpExplore: number
  dropMoney: number
  reputation: number
  honor: number
  monsterDamage: number
  monsterHealth: number
  loot: number
  restedXp: number
  moveSpeed: number
  crossFaction: boolean
}

type FieldKey = keyof WorldSettings

type Field =
  | { kind: "rate"; key: FieldKey; label: string; help: string }
  | { kind: "toggle"; key: FieldKey; label: string; help: string }

const GROUPS: { title: string; blurb: string; fields: Field[] }[] = [
  {
    title: "Experience",
    blurb: "How fast characters level up.",
    fields: [
      { kind: "rate", key: "xpKill", label: "Kill XP", help: "XP from killing monsters" },
      { kind: "rate", key: "xpQuest", label: "Quest XP", help: "XP from completing quests" },
      {
        kind: "rate",
        key: "xpExplore",
        label: "Exploration XP",
        help: "XP from discovering new areas",
      },
    ],
  },
  {
    title: "Rewards",
    blurb: "Loot, reputation, and PvP gains.",
    fields: [
      { kind: "rate", key: "dropMoney", label: "Gold drops", help: "Money dropped by monsters" },
      { kind: "rate", key: "reputation", label: "Reputation", help: "Reputation gained" },
      { kind: "rate", key: "honor", label: "Honor", help: "Honor from PvP" },
    ],
  },
  {
    title: "Difficulty",
    blurb: "Scale the challenge — affects normal mobs, elites, and bosses.",
    fields: [
      {
        kind: "rate",
        key: "monsterDamage",
        label: "Monster damage",
        help: "Damage monsters deal (melee + spells, all tiers)",
      },
      {
        kind: "rate",
        key: "monsterHealth",
        label: "Monster health",
        help: "Monster HP (all tiers)",
      },
      {
        kind: "rate",
        key: "loot",
        label: "Loot drops",
        help: "Item drop chance across all qualities",
      },
    ],
  },
  {
    title: "Quality of life",
    blurb: "Convenience tweaks.",
    fields: [
      {
        kind: "rate",
        key: "restedXp",
        label: "Rested XP",
        help: "How fast rested (bonus) XP accrues",
      },
      {
        kind: "rate",
        key: "moveSpeed",
        label: "Movement speed",
        help: "Player run/travel speed",
      },
      {
        kind: "toggle",
        key: "crossFaction",
        label: "Cross-faction play",
        help: "Let Alliance and Horde group, chat, trade, and use the same auction house",
      },
    ],
  },
]

/** Quick multipliers that set every XP field at once. */
const XP_PRESETS = [1, 2, 5, 10]

export function WorldSettingsScreen() {
  const [settings, setSettings] = React.useState<WorldSettings | null>(null)
  const [loaded, setLoaded] = React.useState<WorldSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [tab, setTab] = React.useState<WorldTab>("rates")

  const load = React.useCallback(async () => {
    if (!isTauri()) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const s = await trackedInvoke<WorldSettings>("get_world_settings")
      setSettings(s)
      setLoaded(s)
    } catch (e) {
      toast.error("Couldn't read world settings", {
        description: typeof e === "string" ? e : String(e),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const dirty =
    settings != null &&
    loaded != null &&
    (Object.keys(settings) as FieldKey[]).some((k) => settings[k] !== loaded[k])

  const setField = (key: FieldKey, value: number | boolean) =>
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))

  const setAllXp = (mult: number) =>
    setSettings((prev) =>
      prev ? { ...prev, xpKill: mult, xpQuest: mult, xpExplore: mult } : prev
    )

  const handleSave = async () => {
    if (!settings || !isTauri()) return
    setSaving(true)
    try {
      const msg = await trackedInvoke<string>("set_world_settings", { settings })
      setLoaded(settings)
      toast.success("World settings saved", { description: msg })
    } catch (e) {
      toast.error("Couldn't save world settings", {
        description: typeof e === "string" ? e : String(e),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-3 pb-6 lg:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <GlobeHemisphereWestIcon className="size-6 text-primary" weight="fill" />
          World
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Server-wide settings — rates, message of the day, and other global
          tweaks. Changes apply live without a restart.
        </p>
      </div>

      <WorldTabs tab={tab} onChange={setTab} />

      {tab === "server" ? (
        <ServerTab />
      ) : loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <CircleNotchIcon className="size-4 animate-spin" />
          Loading…
        </div>
      ) : !settings ? (
        <div className="rounded-md border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
          Couldn't load world settings. Make sure the server has run at least
          once.
        </div>
      ) : (
        <>
          {/* XP quick presets */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 p-3">
            <SparkleIcon className="size-4 text-primary" weight="fill" />
            <span className="text-sm font-medium">Quick XP</span>
            <span className="text-xs text-muted-foreground">
              set all experience rates to
            </span>
            <div className="flex flex-wrap gap-1.5">
              {XP_PRESETS.map((m) => {
                const active =
                  settings.xpKill === m &&
                  settings.xpQuest === m &&
                  settings.xpExplore === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAllXp(m)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-primary/60"
                    )}
                  >
                    {m}×
                  </button>
                )
              })}
            </div>
          </div>

          {GROUPS.map((group) => (
            <div
              key={group.title}
              className="rounded-md border border-border bg-card p-4"
            >
              <div className="mb-3">
                <div className="text-sm font-semibold">{group.title}</div>
                <div className="text-xs text-muted-foreground">
                  {group.blurb}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {group.fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={`ws-${f.key}`} title={f.help}>
                      {f.label}
                    </Label>
                    {f.kind === "toggle" ? (
                      <div className="flex h-8 items-center gap-2">
                        <Switch
                          id={`ws-${f.key}`}
                          checked={settings[f.key] as boolean}
                          onCheckedChange={(c) => setField(f.key, c)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {settings[f.key] ? "On" : "Off"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Input
                          id={`ws-${f.key}`}
                          type="number"
                          min={0}
                          step={0.5}
                          value={settings[f.key] as number}
                          onChange={(e) => {
                            const n = Number(e.target.value)
                            if (Number.isFinite(n)) setField(f.key, Math.max(0, n))
                          }}
                          className="w-24 text-right font-mono tabular-nums"
                        />
                        <span className="text-lg font-medium text-muted-foreground">
                          ×
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving ? (
                <CircleNotchIcon className="size-4 animate-spin" />
              ) : (
                <FloppyDiskIcon className="size-4" weight="fill" />
              )}
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={saving}
              title="Reload values from worldserver.conf"
            >
              <ArrowsClockwiseIcon className="size-4" />
              Reset
            </Button>
            {dirty && (
              <span className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── tab bar ───────────────────────────────────────────────────────────

function WorldTabs({
  tab,
  onChange,
}: {
  tab: WorldTab
  onChange: (t: WorldTab) => void
}) {
  const tabs: { id: WorldTab; label: string; icon: typeof SlidersHorizontalIcon }[] =
    [
      { id: "rates", label: "Rates", icon: SlidersHorizontalIcon },
      { id: "server", label: "Server", icon: HardDrivesIcon },
    ]
  return (
    <div className="flex w-fit flex-wrap gap-1.5 rounded-md border border-border bg-muted/30 p-1">
      {tabs.map((t) => {
        const Icon = t.icon
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── server tab (MoTD + service NPCs) ──────────────────────────────────

function ServerTab() {
  const { selectedCharacter } = useServerState()
  const [motd, setMotd] = React.useState("")
  const [loadedMotd, setLoadedMotd] = React.useState("")
  const [motdLoading, setMotdLoading] = React.useState(true)
  const [savingMotd, setSavingMotd] = React.useState(false)
  const [summoning, setSummoning] = React.useState(false)

  React.useEffect(() => {
    if (!isTauri()) {
      setMotdLoading(false)
      return
    }
    let cancelled = false
    trackedInvoke<string>("get_motd")
      .then((m) => {
        if (cancelled) return
        setMotd(m)
        setLoadedMotd(m)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMotdLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveMotd = async () => {
    if (!isTauri()) return
    setSavingMotd(true)
    try {
      const msg = await trackedInvoke<string>("set_motd", { text: motd })
      setLoadedMotd(motd)
      toast.success("Message of the day set", { description: msg })
    } catch (e) {
      toast.error("Couldn't set the message", {
        description: typeof e === "string" ? e : String(e),
      })
    } finally {
      setSavingMotd(false)
    }
  }

  const summonTransmog = async () => {
    if (!selectedCharacter || !isTauri()) {
      toast.error("Pick a character from the sidebar first.")
      return
    }
    setSummoning(true)
    const id = toast.loading("Summoning the Transmogrifier…")
    try {
      let online = false
      try {
        online = await trackedInvoke<boolean>("is_character_online", {
          guid: selectedCharacter.guid,
        })
      } catch {
        /* fall through — backend will report if it can't reach the player */
      }
      if (!online) {
        toast.warning(`${selectedCharacter.name} isn't logged in`, {
          id,
          description: "Log into the game first — the NPC spawns next to you.",
        })
        return
      }
      const msg = await trackedInvoke<string>("summon_transmog_npc", {
        characterName: selectedCharacter.name,
      })
      toast.success("Done", { id, description: msg })
    } catch (e) {
      toast.error("Couldn't summon the Transmogrifier", {
        id,
        description: typeof e === "string" ? e : String(e),
      })
    } finally {
      setSummoning(false)
    }
  }

  return (
    <>
      {/* Message of the Day */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ChatCircleTextIcon className="size-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Message of the Day</div>
            <div className="text-xs text-muted-foreground">
              Shown to every player when they log in.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={motd}
            disabled={motdLoading}
            placeholder={motdLoading ? "Loading…" : "Welcome to the server!"}
            onChange={(e) => setMotd(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={() => void saveMotd()}
            disabled={savingMotd || motdLoading || motd === loadedMotd}
          >
            {savingMotd ? (
              <CircleNotchIcon className="size-4 animate-spin" />
            ) : (
              <FloppyDiskIcon className="size-4" weight="fill" />
            )}
            Set
          </Button>
        </div>
      </div>

      {/* Service NPCs */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <TShirtIcon className="size-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Transmogrifier</div>
            <div className="text-xs text-muted-foreground">
              Bring the transmog NPC to your character (needs mod-transmog
              installed). It despawns after a few minutes.
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => void summonTransmog()}
          disabled={summoning || !selectedCharacter}
        >
          {summoning ? (
            <CircleNotchIcon className="size-4 animate-spin" />
          ) : (
            <TShirtIcon className="size-4" />
          )}
          Summon to me
        </Button>
      </div>
    </>
  )
}
