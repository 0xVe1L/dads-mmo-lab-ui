import * as React from "react"
import { ArrowDownIcon } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import type { InstallLogLine } from "@/components/server-state-context"

const STICK_THRESHOLD_PX = 24

export function InstallConsole({
  lines,
  pending,
  className,
}: {
  lines: InstallLogLine[]
  pending: InstallLogLine | null
  className?: string
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [stickToBottom, setStickToBottom] = React.useState(true)

  // Reading the DOM directly on every scroll event is cheaper than React
  // state churn — we only flip the state when the user actually crosses
  // the threshold in either direction.
  const onScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
    const atBottom = distanceFromBottom < STICK_THRESHOLD_PX
    setStickToBottom((prev) => (prev === atBottom ? prev : atBottom))
  }, [])

  React.useEffect(() => {
    if (!stickToBottom) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines, pending, stickToBottom])

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    setStickToBottom(true)
  }, [])

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cn(
          // Terminal-y dark surface, independent of theme so it always reads as
          // "console output" rather than "page content".
          "ui-selectable h-full w-full overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-[12.5px] leading-snug text-zinc-200"
        )}
      >
        {lines.length === 0 && !pending ? (
          <div className="text-zinc-500">Waiting for installer output…</div>
        ) : (
          <>
            {lines.map((line) => (
              <ConsoleLine key={line.id} line={line} />
            ))}
            {pending && <ConsoleLine line={pending} />}
          </>
        )}
      </div>

      {!stickToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/95 px-3 py-1.5 text-xs font-medium text-zinc-100 shadow-lg backdrop-blur transition-colors hover:bg-zinc-800"
        >
          <ArrowDownIcon className="size-3.5" />
          Jump to latest
        </button>
      )}
    </div>
  )
}

function ConsoleLine({ line }: { line: InstallLogLine }) {
  const color =
    line.stream === "stderr"
      ? "text-rose-400"
      : line.stream === "system"
        ? "text-amber-300"
        : "text-zinc-200"
  return (
    <pre className={cn("whitespace-pre-wrap break-words", color)}>
      {line.text || " "}
    </pre>
  )
}
