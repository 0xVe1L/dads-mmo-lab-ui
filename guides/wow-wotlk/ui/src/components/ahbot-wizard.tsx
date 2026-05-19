import * as React from "react"
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  InfoIcon,
  UserIcon,
  WarningIcon,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useServerState,
  type GameCharacter,
} from "@/components/server-state-context"
import { cn } from "@/lib/utils"

// Tiny lookup so the character picker reads "Lvl 42 Tauren Druid" instead
// of raw enum ints. WoW 3.3.5a race/class IDs are stable across versions.
const RACE_NAMES: Record<number, string> = {
  1: "Human",
  2: "Orc",
  3: "Dwarf",
  4: "Night Elf",
  5: "Undead",
  6: "Tauren",
  7: "Gnome",
  8: "Troll",
  10: "Blood Elf",
  11: "Draenei",
}
const CLASS_NAMES: Record<number, string> = {
  1: "Warrior",
  2: "Paladin",
  3: "Hunter",
  4: "Rogue",
  5: "Priest",
  6: "Death Knight",
  7: "Shaman",
  8: "Mage",
  9: "Warlock",
  11: "Druid",
}

const POLL_INTERVAL_MS = 5_000

export function AhBotWizard({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    characters,
    refreshCharacters,
    configureAhbotCharacter,
    installedModules,
  } = useServerState()
  const [selectedGuid, setSelectedGuid] = React.useState<string>("")
  const [refreshError, setRefreshError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [applying, setApplying] = React.useState(false)

  // Derive the currently-configured AH Bot character from the active
  // mod_ahbot.conf so we can pre-select it in the dropdown.
  //  - If `GUID` is set (>0), that's the specific character.
  //  - Else if `Account` is set, we fall back to the FIRST character on
  //    that account — which is what the AH Bot module itself does when
  //    GUID=0 (it uses every character on the account, but we have to
  //    pick one to highlight in the picker).
  //  - Else: no current character (fresh / mis-configured install).
  const currentGuid: number | null = React.useMemo(() => {
    const ahbot = installedModules.find((m) => m.key === "mod-ah-bot")
    if (!ahbot) return null
    const guidStr = ahbot.conf["AuctionHouseBot.GUID"]
    const acctStr = ahbot.conf["AuctionHouseBot.Account"]
    const guid = guidStr ? parseInt(guidStr, 10) : 0
    if (guid > 0) return guid
    const acct = acctStr ? parseInt(acctStr, 10) : 0
    if (acct > 0) {
      // GUID=0 + Account=X → first char on that account is the "current" pick.
      const first = characters.find((c) => c.account === acct)
      return first?.guid ?? null
    }
    return null
  }, [installedModules, characters])

  const doRefresh = React.useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await refreshCharacters()
    } catch (err) {
      setRefreshError(String(err))
    } finally {
      setRefreshing(false)
    }
  }, [refreshCharacters])

  // Refresh once on open + poll while open. Stops cleanly when the
  // wizard closes, so we're not hammering the DB in the background.
  React.useEffect(() => {
    if (!open) return
    void doRefresh()
    const interval = setInterval(doRefresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [open, doRefresh])

  // Pre-select the currently-configured character whenever the dialog
  // opens (or after the characters list arrives and the current guid is
  // now resolvable). Replaying this on close-then-open is intentional —
  // user might have changed the config externally between visits.
  React.useEffect(() => {
    if (!open) {
      setApplying(false)
      return
    }
    if (currentGuid != null) {
      setSelectedGuid(String(currentGuid))
    }
  }, [open, currentGuid])

  const selectedChar = characters.find(
    (c) => String(c.guid) === selectedGuid
  )
  const noChange = selectedChar?.guid === currentGuid

  const apply = async () => {
    if (!selectedChar) return
    setApplying(true)
    try {
      // configureAhbotCharacter triggers a worldserver restart internally,
      // so the user lands on the server-control screen. Closing the
      // dialog before that transition feels right — no need to wait.
      onOpenChange(false)
      await configureAhbotCharacter(selectedChar.account, selectedChar.guid)
    } catch (err) {
      // Re-open dialog on failure so the user sees the issue.
      setApplying(false)
      setRefreshError(`Failed to apply: ${String(err)}`)
      onOpenChange(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Auction House Bot character</DialogTitle>
          <DialogDescription>
            Pick the in-game character the bot will use as its auction
            seller. By default this is the auto-created{" "}
            <span className="font-mono">AHBotSeller</span> — you can
            override it with one of your own characters, or revert to the
            default at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <PlayWarningCard />
          <InstructionsCard />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Bot character
              </span>
              <button
                type="button"
                onClick={doRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <ArrowClockwiseIcon
                  className={cn(
                    "size-3.5",
                    refreshing && "animate-spin"
                  )}
                />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {characters.length === 0 ? (
              <EmptyState />
            ) : (
              <Select value={selectedGuid} onValueChange={setSelectedGuid}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select your bot's character…" />
                </SelectTrigger>
                <SelectContent>
                  {characters.map((c) => (
                    <SelectItem key={c.guid} value={String(c.guid)}>
                      <CharacterRow
                        char={c}
                        isCurrent={c.guid === currentGuid}
                      />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Auto-refreshing every 5 seconds — characters you create in
              WoW appear here automatically.
            </p>
          </div>

          {refreshError && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400">
              {refreshError}
            </div>
          )}

          {selectedChar && (
            <div
              className={cn(
                "rounded-md border p-3 text-xs",
                noChange
                  ? "border-muted-foreground/20 bg-muted/30 text-muted-foreground"
                  : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              )}
            >
              {noChange ? (
                <>
                  <InfoIcon className="-mt-0.5 mr-1 inline-block size-3.5" />
                  This is already the bot's current character — no change to apply.
                </>
              ) : (
                <>
                  <CheckCircleIcon className="-mt-0.5 mr-1 inline-block size-3.5" />
                  Will switch bot to:{" "}
                  <span className="font-mono">{selectedChar.name}</span>{" "}
                  (GUID {selectedChar.guid}, account {selectedChar.account})
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={apply}
            disabled={!selectedChar || applying || noChange}
          >
            {applying ? "Applying…" : "Apply & restart server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CharacterRow({
  char,
  isCurrent,
}: {
  char: GameCharacter
  isCurrent: boolean
}) {
  const race = RACE_NAMES[char.race] ?? `Race ${char.race}`
  const klass = CLASS_NAMES[char.class] ?? `Class ${char.class}`
  return (
    <div className="flex items-center gap-2">
      <UserIcon className="size-3.5 text-muted-foreground" />
      <span className="font-mono">{char.name}</span>
      <span className="text-xs text-muted-foreground">
        · Lvl {char.level} {race} {klass}
      </span>
      {isCurrent && (
        <span className="ml-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          current
        </span>
      )}
    </div>
  )
}

function PlayWarningCard() {
  return (
    <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-400">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <WarningIcon className="size-3.5" />
        Don't play with the bot's character
      </div>
      <p className="text-rose-700/90 dark:text-rose-300/90">
        The character the AH Bot uses should be dedicated to the bot —
        don't log into WoW with it for normal play. Per the module's own
        README, logging in with the bot's character can break in-game
        auction-house browsing (the dreaded{" "}
        <span className="font-mono">Searching for items…</span>{" "}
        permanent-loading bug). Pick a character you don't intend to play
        — or stick with the auto-created{" "}
        <span className="font-mono">AHBotSeller</span>.
      </p>
    </div>
  )
}

function InstructionsCard() {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <InfoIcon className="size-3.5" />
        Want to use a different character?
      </div>
      <ol className="ml-4 list-decimal space-y-1 text-amber-700/90 dark:text-amber-300/90">
        <li>
          Log into WoW with your admin account (default:{" "}
          <span className="font-mono">admin</span> /{" "}
          <span className="font-mono">admin</span>).
        </li>
        <li>
          Create a new character on a dedicated account, or pick one of
          your existing alts. Race / class don't matter.
        </li>
        <li>Log out of WoW completely.</li>
        <li>
          Come back here — the new character will appear in the dropdown
          automatically.
        </li>
      </ol>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
      No characters found. Create one in WoW or restart the server (the
      auto-created AHBotSeller should appear once the worldserver is
      ready).
    </div>
  )
}
