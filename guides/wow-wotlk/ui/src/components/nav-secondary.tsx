"use client"

import * as React from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import {
  DiscordLogoIcon,
  DotsThreeOutlineIcon,
  GearIcon,
  PowerIcon,
  QuestionIcon,
  TipJarIcon,
} from "@phosphor-icons/react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { PreInstallTooltip } from "@/components/pre-install-tooltip"
import { useServerState } from "@/components/server-state-context"
import { getSfxPrefs, playSfx } from "@/lib/sfx"
import { isTauri } from "@/lib/tauri"

/**
 * Static footer nav: Settings, More (Get Help + Support Us in a popover),
 * Quit. Settings gates on install like the rest of the menu; More and Quit
 * are always available — a user who can't get the server going is exactly
 * who needs Help/Support, and Quit must work in fullscreen where there's no
 * window close button.
 */
export function NavSecondary({
  ...props
}: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { installed, activePage, setActivePage } = useServerState()

  const handleQuit = React.useCallback(async () => {
    if (!isTauri()) return
    // Play the stealth cue, then give it a beat to be audible before the
    // window closes (closing kills the audio). Skip the delay entirely
    // when SFX are off.
    playSfx("stealth")
    const delay = getSfxPrefs().enabled ? 450 : 0
    const close = async () => {
      try {
        await getCurrentWindow().close()
      } catch (err) {
        console.error("quit failed", err)
      }
    }
    if (delay === 0) {
      void close()
    } else {
      setTimeout(() => void close(), delay)
    }
  }, [])

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {/* Settings — gated until a server exists */}
          <SidebarMenuItem>
            <PreInstallTooltip show={!installed}>
              <SidebarMenuButton
                onClick={() => setActivePage("settings")}
                isActive={activePage === "settings"}
                disabled={!installed}
                tooltip="Settings"
              >
                <GearIcon />
                <span>Settings</span>
              </SidebarMenuButton>
            </PreInstallTooltip>
          </SidebarMenuItem>

          {/* More — popover with Help + Support (always available) */}
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip="More">
                  <DotsThreeOutlineIcon />
                  <span>More</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                className="w-48 rounded-lg"
              >
                <DropdownMenuItem onSelect={() => setActivePage("help")}>
                  <QuestionIcon className="text-muted-foreground" />
                  <span>Get Help</span>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="https://discord.gg/tUpmvSyxKb"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <DiscordLogoIcon className="text-muted-foreground" />
                    <span>Discord</span>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="#">
                    <TipJarIcon className="text-muted-foreground" />
                    <span>Support Us</span>
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>

          {/* Quit — always available (fullscreen has no titlebar close) */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => void handleQuit()}
              tooltip="Quit"
              className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
            >
              <PowerIcon />
              <span>Quit</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
