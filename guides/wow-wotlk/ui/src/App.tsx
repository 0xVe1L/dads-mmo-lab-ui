import type { CSSProperties } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { DemoDashboard } from "@/components/demo-dashboard"
import { InstallOnboarding } from "@/components/install-onboarding"
import {
  ServerStateProvider,
  useServerState,
} from "@/components/server-state-context"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WelcomeScreen } from "@/components/welcome-screen"

export default function App() {
  return (
    <TooltipProvider>
      <ServerStateProvider>
        <AppShell />
      </ServerStateProvider>
    </TooltipProvider>
  )
}

function AppShell() {
  const { installed, installOpen, setInstallOpen } = useServerState()

  return (
    <>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader title={installed ? "Documents" : "Welcome!"} />
          <div className="flex flex-1 flex-col">
            {installed ? <DemoDashboard /> : <WelcomeScreen />}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <InstallOnboarding open={installOpen} onOpenChange={setInstallOpen} />
    </>
  )
}
