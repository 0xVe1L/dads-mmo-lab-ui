import type { CSSProperties } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { DemoDashboard } from "@/components/demo-dashboard"
import { InstallOnboarding } from "@/components/install-onboarding"
import { InstallProgressScreen } from "@/components/install-progress-screen"
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
  const { installed, installOpen, setInstallOpen, installStatus } =
    useServerState()

  // While the installer is running or has just finished, the console takes
  // over the main pane so the user can watch it finish.
  const showInstallScreen = installStatus !== "idle"

  const title = showInstallScreen
    ? "Installing"
    : installed
      ? "Documents"
      : "Welcome!"

  let mainContent
  if (showInstallScreen) {
    mainContent = <InstallProgressScreen />
  } else if (installed) {
    mainContent = <DemoDashboard />
  } else {
    mainContent = <WelcomeScreen />
  }

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
          <SiteHeader title={title} />
          <div className="flex flex-1 flex-col">{mainContent}</div>
        </SidebarInset>
      </SidebarProvider>
      <InstallOnboarding open={installOpen} onOpenChange={setInstallOpen} />
    </>
  )
}
