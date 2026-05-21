import * as React from "react"
import {
  ArrowClockwiseIcon,
  CaretUpDownIcon,
  UserCircleIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@phosphor-icons/react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { PreInstallTooltip } from "@/components/pre-install-tooltip"
import {
  useServerState,
  type GameCharacter,
} from "@/components/server-state-context"
import {
  CLASS_COLORS,
  CLASS_NAMES,
  RACE_NAMES,
} from "@/lib/wow-character-enums"
import { CLASS_ICONS } from "@/lib/class-icons"
import { cn } from "@/lib/utils"

/**
 * Sidebar character switcher (sidebar-07 NavUser pattern). The trigger shows
 * the active character; the dropdown lists the player's *added* characters
 * (a curated subset — see switcherCharacters in the context) plus an "Add
 * character" action that opens the picker modal. Each list row reveals a
 * remove button on hover that drops it from the switcher only (the character
 * stays in the game DB). With an empty list, the trigger opens Add directly.
 */
export function CharacterSwitcher() {
  const {
    installed,
    switcherCharacters,
    selectedCharacter,
    selectedCharacterGuid,
    setSelectedCharacterGuid,
    removeSwitcherCharacter,
  } = useServerState()
  const [addOpen, setAddOpen] = React.useState(false)
  const hasChars = switcherCharacters.length > 0

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {hasChars ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                disabled={!installed}
                tooltip={selectedCharacter?.name ?? "Select a character…"}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <CharacterAvatar character={selectedCharacter} />
                <div className="grid flex-1 text-left text-base leading-tight">
                  {selectedCharacter ? (
                    <>
                      <span className="truncate font-medium">
                        {selectedCharacter.name}
                      </span>
                      <CharacterDetail character={selectedCharacter} />
                    </>
                  ) : (
                    <span className="truncate text-muted-foreground">
                      Select a character…
                    </span>
                  )}
                </div>
                <CaretUpDownIcon className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-(--radix-popper-anchor-width) min-w-56 rounded-lg"
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Your characters
              </DropdownMenuLabel>
              {switcherCharacters.map((c) => (
                <SwitcherRow
                  key={c.guid}
                  character={c}
                  active={c.guid === selectedCharacterGuid}
                  onSelect={() => void setSelectedCharacterGuid(c.guid)}
                  onRemove={() => void removeSwitcherCharacter(c.guid)}
                />
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2"
                onSelect={(e) => {
                  e.preventDefault()
                  setAddOpen(true)
                }}
              >
                <UserPlusIcon className="size-4" />
                Add character
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          // Empty switcher — clicking the trigger opens Add directly.
          <PreInstallTooltip show={!installed}>
            <SidebarMenuButton
              size="lg"
              disabled={!installed}
              onClick={() => setAddOpen(true)}
              tooltip="Add a character"
            >
              <CharacterAvatar character={null} />
              <div className="grid flex-1 text-left text-base leading-tight">
                <span className="truncate text-muted-foreground">
                  Add a character…
                </span>
              </div>
              <UserPlusIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </PreInstallTooltip>
        )}
      </SidebarMenuItem>
      <AddCharacterDialog open={addOpen} onOpenChange={setAddOpen} />
    </SidebarMenu>
  )
}

/** A row in the switcher dropdown: select on click, hover-reveal remove. */
function SwitcherRow({
  character,
  active,
  onSelect,
  onRemove,
}: {
  character: GameCharacter
  active: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn("group/row gap-2 pr-1", active && "bg-accent/60")}
    >
      <CharacterAvatar character={character} />
      <div className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-sm font-medium">{character.name}</span>
        <CharacterDetail character={character} />
      </div>
      {/* Remove from switcher (not the DB). Hidden until row hover; turns
          red on its own hover to read as destructive. */}
      <button
        type="button"
        aria-label={`Remove ${character.name} from switcher`}
        title="Remove from switcher"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove()
        }}
        className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-colors group-hover/row:opacity-100 hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100"
      >
        <UserMinusIcon className="size-4" />
      </button>
    </DropdownMenuItem>
  )
}

function CharacterAvatar({ character }: { character: GameCharacter | null }) {
  const ring = character ? CLASS_COLORS[character.class] : null
  // Bundled class crest — rendered straight from the build, no network
  // fetch. Radix falls back to the placeholder if the class id has no
  // mapped icon, so this degrades cleanly.
  const iconSrc = character ? CLASS_ICONS[character.class] : null
  return (
    <Avatar
      className={cn(
        "h-9 w-9 rounded-lg ring-2 ring-transparent",
        ring && ring.replace("text-", "ring-")
      )}
    >
      {iconSrc && (
        <AvatarImage
          src={iconSrc}
          alt={character ? CLASS_NAMES[character.class] : undefined}
          className="rounded-lg"
        />
      )}
      <AvatarFallback className="rounded-lg bg-muted">
        <UserCircleIcon className="size-5 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  )
}

function CharacterDetail({ character }: { character: GameCharacter }) {
  const race = RACE_NAMES[character.race] ?? `Race ${character.race}`
  const klass = CLASS_NAMES[character.class] ?? `Class ${character.class}`
  const klassColor = CLASS_COLORS[character.class] ?? "text-foreground"
  return (
    <span className="truncate text-xs text-muted-foreground">
      Lvl {character.level} | {race}{" "}
      <span className={cn("font-medium", klassColor)}>{klass}</span>
    </span>
  )
}

/**
 * Pick a character to ADD to the switcher. Lists DB characters not already
 * in the switcher (and hides the AH Bot seller). Selecting one adds it and
 * makes it active.
 */
function AddCharacterDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { characters, refreshCharacters, switcherCharacters, addSwitcherCharacter } =
    useServerState()
  const [refreshing, setRefreshing] = React.useState(false)
  const [refreshError, setRefreshError] = React.useState<string | null>(null)

  const inSwitcher = React.useMemo(
    () => new Set(switcherCharacters.map((c) => c.guid)),
    [switcherCharacters]
  )
  // Addable = real characters not already in the switcher. Hide the AH Bot
  // seller (managed by the AH Bot wizard, not a real play character).
  const addable = React.useMemo(
    () =>
      characters.filter(
        (c) =>
          c.name.toLowerCase() !== "ahbotseller" && !inSwitcher.has(c.guid)
      ),
    [characters, inSwitcher]
  )

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

  React.useEffect(() => {
    if (open) void doRefresh()
  }, [open, doRefresh])

  const add = async (guid: number) => {
    await addSwitcherCharacter(guid)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a character</DialogTitle>
          <DialogDescription>
            Pick a character to add to your switcher. You can keep several
            (e.g. different classes) and quick-switch between them. Removing
            one later only drops it from the switcher — it stays in-game.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Characters
            </span>
            <button
              type="button"
              onClick={doRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <ArrowClockwiseIcon
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {refreshError && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-600 dark:text-rose-400">
              {refreshError}
            </div>
          )}

          {addable.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              No characters to add. Log into WoW, create a character, then come
              back and hit Refresh.
            </div>
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {addable.map((c) => (
                <button
                  key={c.guid}
                  type="button"
                  onClick={() => void add(c.guid)}
                  className="flex w-full items-center gap-3 rounded-md border border-border p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-muted/30"
                >
                  <CharacterAvatar character={c} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-tight">
                      {c.name}
                    </div>
                    <CharacterDetail character={c} />
                  </div>
                  <UserPlusIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
