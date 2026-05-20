import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Wraps a (typically disabled) sidebar control so hovering it explains
 * *why* it's inert before the server is installed. Disabled buttons
 * swallow pointer events, so the tooltip trigger is a wrapping <span>
 * that still receives hover.
 *
 * When `show` is false the children render untouched — no wrapper, no
 * tooltip — so once installed there's zero layout change or overhead.
 * (The sidebar's built-in `tooltip` prop can't do this job: it only
 * renders when the sidebar is collapsed to icon mode.)
 */
export function PreInstallTooltip({
  show,
  label = "Install server to get started",
  side = "right",
  children,
}: {
  show: boolean
  label?: string
  side?: "top" | "right" | "bottom" | "left"
  children: React.ReactNode
}) {
  if (!show) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full">{children}</span>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
