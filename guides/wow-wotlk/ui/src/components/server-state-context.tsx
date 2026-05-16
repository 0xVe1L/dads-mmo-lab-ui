import * as React from "react"

type ServerState = {
  installed: boolean
  installOpen: boolean
  setInstallOpen: (open: boolean) => void
  openInstall: () => void
}

const ServerStateContext = React.createContext<ServerState | null>(null)

export function ServerStateProvider({ children }: { children: React.ReactNode }) {
  const [installOpen, setInstallOpen] = React.useState(false)
  // TODO: replace with a real Tauri command that scans ~/wow-server* for installs.
  const installed = false

  const value = React.useMemo<ServerState>(
    () => ({
      installed,
      installOpen,
      setInstallOpen,
      openInstall: () => setInstallOpen(true),
    }),
    [installed, installOpen]
  )

  return <ServerStateContext.Provider value={value}>{children}</ServerStateContext.Provider>
}

export function useServerState() {
  const ctx = React.useContext(ServerStateContext)
  if (!ctx) throw new Error("useServerState must be used inside ServerStateProvider")
  return ctx
}
