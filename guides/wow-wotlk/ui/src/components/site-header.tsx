import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

/**
 * App title bar. Each content page renders its own titled header (with
 * an icon) above its description, so the old per-page breadcrumb here
 * was redundant — this slot now just brands the window as "The Lab".
 */
export function SiteHeader() {
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
      </div>
    </header>
  )
}
