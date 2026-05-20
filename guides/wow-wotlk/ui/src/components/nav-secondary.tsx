"use client"

import * as React from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { PreInstallTooltip } from "@/components/pre-install-tooltip"
import { useServerState } from "@/components/server-state-context"
import { cn } from "@/lib/utils"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    /** Used when this item is a plain link. Items that pass `onClick`
     * are rendered as buttons and route via the in-app activePage
     * state instead — keeps Settings / Get Help / Search side by side
     * even though only some of them have real screens yet. */
    url: string
    icon: React.ReactNode
    onClick?: () => void
    isActive?: boolean
    /** Stays interactive even before a server is installed. Get Help /
     * Support Us are always reachable; everything else gates on install. */
    alwaysEnabled?: boolean
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { installed } = useServerState()

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            // Gate on install unless the item opts out. Note: we disable
            // the inner control (button/anchor), NOT the <SidebarMenuItem>
            // — putting pointer-events-none on the item would also swallow
            // the PreInstallTooltip's hover.
            const gated = !installed && !item.alwaysEnabled
            return (
              <SidebarMenuItem key={item.title} aria-disabled={gated}>
                <PreInstallTooltip show={gated}>
                  {item.onClick ? (
                    <SidebarMenuButton
                      onClick={item.onClick}
                      isActive={item.isActive}
                      disabled={gated}
                      tooltip={item.title}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild>
                      <a
                        href={item.url}
                        className={cn(
                          gated && "pointer-events-none opacity-50"
                        )}
                      >
                        {item.icon}
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  )}
                </PreInstallTooltip>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
