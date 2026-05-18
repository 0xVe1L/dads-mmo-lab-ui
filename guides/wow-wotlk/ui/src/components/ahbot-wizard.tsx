import * as React from "react"
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  InfoIcon,
  UserIcon,
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
  const { characters, refreshCharacters, configureAhbotCharacter } =
    useServerState()
  const [selectedGuid, setSelectedGuid] = React.useState<string>("")
  const [refreshError, setRefreshError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [applying, setApplying] = React.useState(false)

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

  // Clear selection when the dialog closes so reopening starts fresh.
  React.useEffect(() => {
    if (!open) {
      setSelectedGuid("")
      setApplying(false)
    }
  }, [open])

  const selectedChar = characters.find(
    (c) => String(c.guid) === selectedGuid
  )

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
            Pick the in-game character that will list items on the auction
            house. The bot uses this character's account to operate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <InstructionsCard />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pick a character
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
                      <CharacterRow char={c} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Auto-refreshing every 5 seconds — characters created in WoW
              will appear here automatically.
            </p>
          </div>

          {refreshError && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400">
              {refreshError}
            </div>
          )}

          {selectedChar && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircleIcon className="-mt-0.5 mr-1 inline-block size-3.5" />
              Selected: <span className="font-mono">{selectedChar.name}</span>{" "}
              (GUID {selectedChar.guid}, account {selectedChar.account})
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!selectedChar || applying}>
            {applying ? "Applying…" : "Apply & restart server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CharacterRow({ char }: { char: GameCharacter }) {
  const race = RACE_NAMES[char.race] ?? `Race ${char.race}`
  const klass = CLASS_NAMES[char.class] ?? `Class ${char.class}`
  return (
    <div className="flex items-center gap-2">
      <UserIcon className="size-3.5 text-muted-foreground" />
      <span className="font-mono">{char.name}</span>
      <span className="text-xs text-muted-foreground">
        · Lvl {char.level} {race} {klass}
      </span>
    </div>
  )
}

function InstructionsCard() {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <InfoIcon className="size-3.5" />
        Don't have a bot character yet?
      </div>
      <ol className="ml-4 list-decimal space-y-1 text-amber-700/90 dark:text-amber-300/90">
        <li>
          Open your WoW 3.3.5a client and log in with{" "}
          <span className="font-mono">admin</span> /{" "}
          <span className="font-mono">admin</span> (or your custom admin
          account).
        </li>
        <li>
          Create a new character on either faction — name them anything
          (e.g. <span className="font-mono">AHBOT</span>). Race / class
          don't matter, the bot only uses the account+GUID.
        </li>
        <li>Log out of WoW completely (back to character select is fine).</li>
        <li>
          Come back here and pick the new character from the dropdown.
          We'll apply config and restart the server.
        </li>
      </ol>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
      No characters found yet. Create one in WoW (see above) and the list
      will update automatically.
    </div>
  )
}
