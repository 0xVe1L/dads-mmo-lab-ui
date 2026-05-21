import * as React from "react"
import {
  CheckIcon,
  CopyIcon,
  QuestionIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

/**
 * Help / FAQ page (reached from the "Get Help" entry in the More menu).
 * Audience is non-technical, so the few terminal commands that come up
 * during install troubleshooting are rendered as copy-able console
 * blocks — visually distinct from prose so there's no guessing about
 * what to paste into Konsole.
 */
export function HelpScreen() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold leading-tight">
          <QuestionIcon className="size-6 shrink-0 text-muted-foreground" />
          Help &amp; FAQ
        </h1>
        <p className="text-sm text-muted-foreground">
          Stuck on the install? These are the snags people hit most often,
          and exactly what to type to get past them. Commands run in{" "}
          <span className="font-medium text-foreground">Konsole</span> —
          Steam Deck&apos;s built-in terminal, available in Desktop Mode.
        </p>
      </header>

      <div className="space-y-4">
        <FaqItem question="Having issues with the password step?">
          <p>
            You may not have set it in Desktop mode yet. Open Konsole and run
            this command to set a new password, then try again.
          </p>
          <ConsoleCommand command="passwd" />
        </FaqItem>

        <FaqItem question="The installer can't change the file system to read + write">
          <p>
            The installer should handle setting the Steam Deck&apos;s file
            system to read + write, but you may need to run the following in
            Konsole:
          </p>
          <ConsoleCommand command="sudo steamos-readonly disable" />
        </FaqItem>

        <FaqItem question="Installer failed with: “failed to start db container”">
          <p>Install docker-compose manually:</p>
          <ConsoleCommand command="sudo pacman -S docker-compose" />
        </FaqItem>
      </div>
    </div>
  )
}

function FaqItem({
  question,
  children,
}: {
  question: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card/40 p-4">
      <h2 className="text-base font-semibold leading-tight">{question}</h2>
      <div className="mt-2 space-y-3 text-sm text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

/**
 * A single shell command, styled to read unmistakably as something you
 * paste into a terminal: dark console background, monospace font, a
 * leading prompt glyph, and a copy button (handy when you can't type
 * the command by hand on a Deck).
 */
function ConsoleCommand({ command }: { command: string }) {
  const [copied, setCopied] = React.useState(false)

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be unavailable; the command stays selectable.
    }
  }, [command])

  return (
    <div className="group flex items-center gap-2 rounded-md border border-zinc-700/60 bg-zinc-950 px-3 py-2 font-mono text-[13px] text-emerald-300 shadow-inner">
      <TerminalWindowIcon className="size-4 shrink-0 text-zinc-500" />
      <code className="flex-1 select-all whitespace-pre-wrap break-all leading-relaxed">
        <span className="mr-2 select-none text-zinc-500">$</span>
        {command}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : "Copy command"}
        title={copied ? "Copied!" : "Copy"}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100",
          copied && "text-emerald-400"
        )}
      >
        {copied ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </button>
    </div>
  )
}
