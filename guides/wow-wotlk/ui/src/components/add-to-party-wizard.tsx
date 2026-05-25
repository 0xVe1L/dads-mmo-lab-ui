import * as React from "react"
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ShieldIcon,
  SwordIcon,
  HeartIcon,
  UserPlusIcon,
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
  ALL_ROLES,
  type Role,
  type SpecEntry,
  formatSpecName,
  getBuildAtLevel,
  getBuildLevels,
  getClassesForRole,
  getSpecsForClassRole,
  snapToBuildLevel,
} from "@/lib/talent-builds"
import {
  CLASS_COLOR_HEX,
  CLASS_COLORS,
  CLASS_ICON_NAMES,
  CLASS_NAMES,
} from "@/lib/wow-character-enums"
import { cn } from "@/lib/utils"

/**
 * Add-to-Party wizard (Phase 2d).
 *
 * Four-step flow: Role → Class → Spec → Level. Each step is gated on
 * the previous selection; the user can step back. The final step
 * surfaces the chosen build's tree distribution + wowhead link, then
 * the "Add to Party" CTA fires `onConfirm` with the resolved selection.
 *
 * No backend wiring lives here — the wizard is purely a picker. Phase
 * 2e will provide the `add_bot_to_party` Tauri command that consumes
 * the selection (pick AddClass bot → level → talents spec → autogear
 * → maintenance → summon → .group join, all via Eluna whispers + SOAP).
 *
 * Level snapping: the user's character level is fed in as a hint so
 * the wizard defaults to the highest build level ≤ character level
 * (a Lv 73 character lands on the Lv 70 build by default).
 */

type Step = "role" | "class" | "spec" | "level"

export interface AddToPartySelection {
  role: Role
  classId: number
  spec: SpecEntry
  level: number
}

interface AddToPartyWizardProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** User's character level — used to default the Level step. */
  characterLevel?: number
  onConfirm?: (selection: AddToPartySelection) => void
}

export function AddToPartyWizard({
  open,
  onOpenChange,
  characterLevel,
  onConfirm,
}: AddToPartyWizardProps) {
  const [step, setStep] = React.useState<Step>("role")
  const [role, setRole] = React.useState<Role | null>(null)
  const [classId, setClassId] = React.useState<number | null>(null)
  const [spec, setSpec] = React.useState<SpecEntry | null>(null)
  const [level, setLevel] = React.useState<number | null>(null)

  // Reset everything when the dialog closes. The next open starts at
  // role-pick; we don't try to persist mid-flow state across opens.
  React.useEffect(() => {
    if (!open) {
      setStep("role")
      setRole(null)
      setClassId(null)
      setSpec(null)
      setLevel(null)
    }
  }, [open])

  const handlePickRole = (r: Role) => {
    setRole(r)
    setClassId(null)
    setSpec(null)
    setLevel(null)
    setStep("class")
  }
  const handlePickClass = (cid: number) => {
    setClassId(cid)
    setSpec(null)
    setLevel(null)
    setStep("spec")
  }
  const handlePickSpec = (s: SpecEntry) => {
    setSpec(s)
    const target = characterLevel ?? 80
    setLevel(snapToBuildLevel(s, target))
    setStep("level")
  }

  const handleBack = () => {
    if (step === "class") setStep("role")
    else if (step === "spec") setStep("class")
    else if (step === "level") setStep("spec")
  }

  const handleConfirm = () => {
    if (!role || classId === null || !spec || level === null) return
    onConfirm?.({ role, classId, spec, level })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlusIcon className="size-5 text-primary" />
            Add to Party
          </DialogTitle>
          <DialogDescription>
            <StepCrumbs
              step={step}
              role={role}
              classId={classId}
              spec={spec}
              level={level}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[280px]">
          {step === "role" && <RoleStep onPick={handlePickRole} />}
          {step === "class" && role && (
            <ClassStep role={role} onPick={handlePickClass} />
          )}
          {step === "spec" && role && classId !== null && (
            <SpecStep
              classId={classId}
              role={role}
              onPick={handlePickSpec}
            />
          )}
          {step === "level" && spec && (
            <LevelStep
              spec={spec}
              selectedLevel={level}
              onPickLevel={setLevel}
              characterLevel={characterLevel}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {step !== "role" && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeftIcon className="size-4" />
              Back
            </Button>
          )}
          {step === "level" && (
            <Button
              onClick={handleConfirm}
              disabled={level === null}
              className="ml-auto"
            >
              <CheckCircleIcon className="size-4" weight="fill" />
              Add to Party
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────────────────────────────────────────────
// Step 1 — Role
// ───────────────────────────────────────────────────────────────────

const ROLE_META: Record<
  Role,
  { icon: React.ReactNode; tagline: string; accent: string }
> = {
  Tank: {
    icon: <ShieldIcon className="size-7" weight="fill" />,
    tagline: "Soaks damage, holds threat",
    accent: "text-blue-400",
  },
  Healer: {
    icon: <HeartIcon className="size-7" weight="fill" />,
    tagline: "Keeps the party alive",
    accent: "text-emerald-400",
  },
  DPS: {
    icon: <SwordIcon className="size-7" weight="fill" />,
    tagline: "Deals damage",
    accent: "text-rose-400",
  },
}

function RoleStep({ onPick }: { onPick: (r: Role) => void }) {
  return (
    <div className="space-y-2">
      {ALL_ROLES.map((r) => {
        const meta = ROLE_META[r]
        return (
          <button
            key={r}
            type="button"
            onClick={() => onPick(r)}
            className="flex w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span className={cn("shrink-0", meta.accent)}>{meta.icon}</span>
            <div className="flex-1">
              <div className="text-base font-semibold">{r}</div>
              <div className="text-xs text-muted-foreground">
                {meta.tagline}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Step 2 — Class
// ───────────────────────────────────────────────────────────────────

function ClassStep({
  role,
  onPick,
}: {
  role: Role
  onPick: (classId: number) => void
}) {
  const classes = React.useMemo(() => getClassesForRole(role), [role])
  return (
    <div className="grid grid-cols-3 gap-2">
      {classes.map((cid) => {
        const name = CLASS_NAMES[cid] ?? `#${cid}`
        const color = CLASS_COLORS[cid] ?? "text-foreground"
        const ring = CLASS_COLOR_HEX[cid] ?? "#888"
        const iconName = CLASS_ICON_NAMES[cid]
        return (
          <button
            key={cid}
            type="button"
            onClick={() => onPick(cid)}
            className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-card p-2 transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <div
              className="flex size-12 items-center justify-center overflow-hidden rounded border-2 bg-muted"
              style={{ borderColor: ring }}
            >
              {iconName && (
                <img
                  src={`https://wow.zamimg.com/images/wow/icons/large/${iconName}.jpg`}
                  alt={name}
                  className="size-full object-cover"
                  draggable={false}
                />
              )}
            </div>
            <span className={cn("text-xs font-medium", color)}>{name}</span>
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Step 3 — Spec
// ───────────────────────────────────────────────────────────────────

function SpecStep({
  classId,
  role,
  onPick,
}: {
  classId: number
  role: Role
  onPick: (spec: SpecEntry) => void
}) {
  const specs = React.useMemo(
    () => getSpecsForClassRole(classId, role),
    [classId, role]
  )
  if (specs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        No matching specs in the dataset for this class + role.
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {specs.map((s) => {
        const levels = getBuildLevels(s)
        return (
          <button
            key={s.specIndex}
            type="button"
            onClick={() => onPick(s)}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span className="text-sm font-medium">
              {formatSpecName(s.specName)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Lv {levels.join(" · ")}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Step 4 — Level
// ───────────────────────────────────────────────────────────────────

function LevelStep({
  spec,
  selectedLevel,
  onPickLevel,
  characterLevel,
}: {
  spec: SpecEntry
  selectedLevel: number | null
  onPickLevel: (lvl: number) => void
  characterLevel?: number
}) {
  const levels = React.useMemo(() => getBuildLevels(spec), [spec])
  const build =
    selectedLevel !== null ? getBuildAtLevel(spec, selectedLevel) : null

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          Bot level
          {characterLevel !== undefined && (
            <span className="ml-1.5 normal-case tracking-normal">
              · default snaps to your Lv {characterLevel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {levels.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => onPickLevel(lvl)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                selectedLevel === lvl
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary/60 hover:bg-primary/5"
              )}
            >
              Lv {lvl}
            </button>
          ))}
        </div>
      </div>

      {build && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-semibold text-foreground">
              {formatSpecName(spec.specName)} — Lv {build.level}
            </span>
            <span className="text-muted-foreground">
              {build.treeDistribution.join(" / ")} ({build.totalPoints} pts)
            </span>
          </div>
          <div className="break-all font-mono text-[10px] text-muted-foreground">
            {build.wowheadLink}
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Stepper crumbs (shown below dialog title)
// ───────────────────────────────────────────────────────────────────

function StepCrumbs({
  step,
  role,
  classId,
  spec,
  level,
}: {
  step: Step
  role: Role | null
  classId: number | null
  spec: SpecEntry | null
  level: number | null
}) {
  const crumbs: { label: string; active: boolean; placeholder: string }[] = [
    {
      label: role ?? "Role",
      active: step === "role",
      placeholder: "Role",
    },
    {
      label: classId !== null ? CLASS_NAMES[classId] ?? `#${classId}` : "Class",
      active: step === "class",
      placeholder: "Class",
    },
    {
      label: spec ? formatSpecName(spec.specName) : "Spec",
      active: step === "spec",
      placeholder: "Spec",
    },
    {
      label: level !== null ? `Lv ${level}` : "Level",
      active: step === "level",
      placeholder: "Level",
    },
  ]
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.placeholder}>
          {i > 0 && <span className="text-muted-foreground/50">›</span>}
          <span
            className={cn(
              c.active
                ? "font-semibold text-foreground"
                : c.label === c.placeholder
                  ? "text-muted-foreground/60"
                  : "text-muted-foreground"
            )}
          >
            {c.label}
          </span>
        </React.Fragment>
      ))}
    </span>
  )
}
