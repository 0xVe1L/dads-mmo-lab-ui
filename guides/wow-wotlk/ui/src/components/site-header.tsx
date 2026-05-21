import { SpeakerHighIcon, SpeakerNoneIcon } from "@phosphor-icons/react"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useSfx } from "@/lib/sfx"

/**
 * App title bar. Each content page renders its own titled header (with
 * an icon) above its description, so the old per-page breadcrumb here
 * was redundant — this slot now just brands the window as "The Lab".
 * The mute toggle on the right shares its state with the Audio section
 * in Settings (both edit the sfx store).
 */
export function SiteHeader() {
  const { enabled, toggleEnabled } = useSfx()
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <span className="font-heading text-base font-semibold tracking-tight">
          The Lab
        </span>
        <button
          type="button"
          onClick={toggleEnabled}
          aria-label={enabled ? "Mute sound effects" : "Unmute sound effects"}
          title={enabled ? "Mute sound effects" : "Unmute sound effects"}
          className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {enabled ? (
            <SpeakerHighIcon className="size-5" />
          ) : (
            <SpeakerNoneIcon className="size-5" />
          )}
        </button>
      </div>
    </header>
  )
}
