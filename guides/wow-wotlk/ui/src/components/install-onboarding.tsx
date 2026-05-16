"use client"

import * as React from "react"
import {
  BookOpenIcon,
  CaretLeftIcon,
  CoinsIcon,
  EyeIcon,
  EyeSlashIcon,
  PaletteIcon,
  ScalesIcon,
  StackIcon,
  StorefrontIcon,
  SwordIcon,
  UserIcon,
} from "@phosphor-icons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

type ServerType = "base" | "npcbots" | "playerbots"

type ModuleKey =
  | "mod-ah-bot"
  | "mod-solocraft"
  | "mod-autobalance"
  | "mod-transmog"
  | "mod-individual-progression"
  | "mod-1v1-arena"
  | "mod-aoe-loot"
  | "mod-learn-spells"

type FormState = {
  serverType: ServerType
  modules: Record<ModuleKey, boolean>
  adminUser: string
  adminPass: string
}

const DEFAULT_STATE: FormState = {
  serverType: "playerbots",
  modules: {
    "mod-ah-bot": true,
    "mod-solocraft": true,
    "mod-autobalance": true,
    "mod-transmog": true,
    "mod-individual-progression": false,
    "mod-1v1-arena": false,
    "mod-aoe-loot": false,
    "mod-learn-spells": false,
  },
  adminUser: "admin",
  adminPass: "admin",
}

const MODULES: {
  key: ModuleKey
  label: string
  blurb: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  { key: "mod-ah-bot", label: "Auction House Bot", blurb: "Populates the AH with items so the economy isn't empty.", Icon: StorefrontIcon },
  { key: "mod-solocraft", label: "Solocraft", blurb: "Scales dungeons and raids down to a single player.", Icon: UserIcon },
  { key: "mod-autobalance", label: "Auto Balance", blurb: "Dynamic difficulty based on party size and gear.", Icon: ScalesIcon },
  { key: "mod-transmog", label: "Transmogrification", blurb: "Change the appearance of your gear.", Icon: PaletteIcon },
  { key: "mod-individual-progression", label: "Individual Progression", blurb: "Vanilla → TBC → WotLK gating per character.", Icon: StackIcon },
  { key: "mod-1v1-arena", label: "1v1 Arena", blurb: "Solo arena queues.", Icon: SwordIcon },
  { key: "mod-aoe-loot", label: "AoE Loot", blurb: "Loot all nearby corpses with one click.", Icon: CoinsIcon },
  { key: "mod-learn-spells", label: "Learn Spells on Levelup", blurb: "Skip the trainer trips.", Icon: BookOpenIcon },
]

const STEPS = [
  {
    title: "Choose your server...",
    description: "Which AzerothCore variant do you want to install? You can change modules later, but the variant is baked in at install time.",
  },
  {
    title: "Pick your modules",
    description: "Optional add-ons. Pre-selected ones are the most-loved defaults. You can add or remove modules later from the management panel.",
  },
  {
    title: "Admin account",
    description: "This account has full GM powers. You'll use it to log into WoW and to send GM commands from this app.",
  },
  {
    title: "Ready to install",
    description: "Review your choices. Installing Playerbots compiles AzerothCore from source — plan for 2–4 hours and keep your device plugged in.",
  },
] as const

export function InstallOnboarding({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = React.useState(0)
  const [state, setState] = React.useState<FormState>(DEFAULT_STATE)

  // Reset state when the dialog closes so reopening starts fresh
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep(0)
        setState(DEFAULT_STATE)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const selectedModules = MODULES.filter((m) => state.modules[m.key])

  const advance = () => {
    if (isLast) onOpenChange(false)
    else setStep((s) => s + 1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-140 grid-cols-[2fr_3fr] gap-0 overflow-hidden rounded-xl p-0 text-sm sm:max-w-225" aria-description="onboarding options">
        {/* LEFT — title, description, step dots, back */}
        <div className="flex flex-col bg-muted/40 p-6">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CaretLeftIcon className="size-3.5" />
              Back
            </button>
          ) : (
            <span className="h-4" />
          )}

          <div className="mt-8 flex-1 space-y-2">
            <h2 className="font-heading text-2xl font-semibold leading-tight">
              {current.title}
            </h2>
            <p className="text-sm text-muted-foreground">{current.description}</p>
          </div>

          <StepDots total={STEPS.length} current={step} />
        </div>

        {/* RIGHT — form for the current step + advance button */}
        <div className="flex min-h-0 flex-col p-6">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {step === 0 && (
              <ServerTypeStep
                value={state.serverType}
                onChange={(serverType) => setState((s) => ({ ...s, serverType }))}
              />
            )}
            {step === 1 && (
              <ModulesStep
                value={state.modules}
                onChange={(modules) => setState((s) => ({ ...s, modules }))}
              />
            )}
            {step === 2 && (
              <AdminStep
                user={state.adminUser}
                pass={state.adminPass}
                onChange={(adminUser, adminPass) =>
                  setState((s) => ({ ...s, adminUser, adminPass }))
                }
              />
            )}
            {step === 3 && <SummaryStep state={state} selectedModules={selectedModules} />}
          </div>

          <Button size="lg" className="mt-4 w-full" onClick={advance}>
            {isLast ? "Install Playerbots server" : "Next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === current ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  )
}

function ServerTypeStep({
  value,
  onChange,
}: {
  value: ServerType
  onChange: (value: ServerType) => void
}) {
  const options: {
    key: ServerType
    title: string
    blurb: string
    badge: { text: string; variant: "default" | "secondary" | "outline" }
    disabled?: boolean
  }[] = [
    {
      key: "playerbots",
      title: "Playerbots",
      blurb: "Hundreds of AI players roaming the world — quest, dungeon, raid, chat. The most alive solo experience. Compiles from source (2–4 hours).",
      badge: { text: "Recommended", variant: "secondary" },
    },
    {
      key: "npcbots",
      title: "NPCBots",
      blurb: "Hire AI companions to join your party. Faster install but smaller world.",
      badge: { text: "Deprecated", variant: "outline" },
      disabled: true,
    },
    {
      key: "base",
      title: "Base AzerothCore",
      blurb: "Clean server with no bots. Lightest on resources.",
      badge: { text: "Deprecated", variant: "outline" },
      disabled: true,
    },
  ]

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as ServerType)}
      className="gap-3"
    >
      {options.map((opt) => (
        <Label
          key={opt.key}
          htmlFor={`server-${opt.key}`}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors",
            opt.disabled
              ? "cursor-not-allowed opacity-50"
              : "hover:bg-accent has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent"
          )}
        >
          <RadioGroupItem
            id={`server-${opt.key}`}
            value={opt.key}
            disabled={opt.disabled}
            className="mt-0.5"
          />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{opt.title}</span>
              <Badge variant={opt.badge.variant} className="text-[10px] font-normal">
                {opt.badge.text}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{opt.blurb}</p>
          </div>
        </Label>
      ))}
    </RadioGroup>
  )
}

function ModulesStep({
  value,
  onChange,
}: {
  value: Record<ModuleKey, boolean>
  onChange: (value: Record<ModuleKey, boolean>) => void
}) {
  return (
    <div className="space-y-2">
      {MODULES.map((m) => (
        <Label
          key={m.key}
          htmlFor={`mod-${m.key}`}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent has-data-[state=checked]:border-primary/60 has-data-[state=checked]:bg-accent/50"
        >
          <Checkbox
            id={`mod-${m.key}`}
            checked={value[m.key]}
            onCheckedChange={(checked) =>
              onChange({ ...value, [m.key]: checked === true })
            }
            className="mt-0.5"
          />
          <m.Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-0.5">
            <div className="text-sm font-medium text-foreground">{m.label}</div>
            <p className="text-xs text-muted-foreground">{m.blurb}</p>
          </div>
        </Label>
      ))}
    </div>
  )
}

function AdminStep({
  user,
  pass,
  onChange,
}: {
  user: string
  pass: string
  onChange: (user: string, pass: string) => void
}) {
  const [useDefaults, setUseDefaults] = React.useState(true)
  const [showPassword, setShowPassword] = React.useState(true)

  const handleDefaultsToggle = (checked: boolean) => {
    setUseDefaults(checked)
    if (checked) onChange("admin", "admin")
  }

  return (
    <div className="space-y-4">
      <Label
        htmlFor="use-defaults"
        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-muted/30 p-3"
      >
        <Checkbox
          id="use-defaults"
          checked={useDefaults}
          onCheckedChange={(checked) => handleDefaultsToggle(checked === true)}
        />
        <span className="text-sm">
          Use default credentials
        </span>
      </Label>

      <div className="space-y-1.5">
        <Label htmlFor="admin-user">Username</Label>
        <Input
          id="admin-user"
          value={user}
          onChange={(e) => onChange(e.target.value, pass)}
          disabled={useDefaults}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin-pass">Password</Label>
        <div className="relative">
          <Input
            id="admin-pass"
            type={showPassword ? "text" : "password"}
            value={pass}
            onChange={(e) => onChange(user, e.target.value)}
            disabled={useDefaults}
            autoComplete="new-password"
            className="pr-8"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((s) => !s)}
            disabled={useDefaults}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {showPassword ? (
              <EyeSlashIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          WoW account names are case-sensitive and stored locally on your device.
        </p>
      </div>
    </div>
  )
}

function SummaryStep({
  state,
  selectedModules,
}: {
  state: FormState
  selectedModules: { key: ModuleKey; label: string }[]
}) {
  return (
    <div className="space-y-4">
      <SummaryRow label="Server">Playerbots</SummaryRow>
      <SummaryRow label="Admin account">
        <span className="font-mono">{state.adminUser}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="font-mono">{"•".repeat(Math.max(state.adminPass.length, 4))}</span>
      </SummaryRow>
      <SummaryRow label="Modules">
        {selectedModules.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedModules.map((m) => (
              <Badge key={m.key} variant="secondary" className="font-normal">
                {m.label}
              </Badge>
            ))}
          </div>
        )}
      </SummaryRow>
      <SummaryRow label="Install location">
        <span className="font-mono text-xs">~/wow-server-playerbots</span>
      </SummaryRow>
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
        Playerbots compiles AzerothCore from source. Expect 2–4 hours on a Steam Deck.
        Keep your device plugged in and don't let it sleep.
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 border-b border-border/60 pb-3 last:border-b-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}
