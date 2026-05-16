import * as React from "react"
import { listen } from "@tauri-apps/api/event"

import { trackedInvoke, isTauri } from "@/lib/tauri"

export type InstallVariant = "base" | "npcbots" | "playerbots"

export type DetectedInstall = {
  path: string
  variant: InstallVariant | "unknown"
}

export type InstallStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "cleaning"
  | "succeeded"
  | "failed"
  | "cancelled"

export type OnboardingChoices = {
  serverType: InstallVariant
  adminUser: string
  adminPass: string
  buildMethod?: "prebuilt" | "compile"
  force?: boolean
}

export type InstallLogLine = {
  id: number
  stream: "stdout" | "stderr" | "system"
  text: string
}

type InstallOutputEvent = {
  stream: "stdout" | "stderr" | "system"
  line: string
  /**
   * True when the source line was `\r`-terminated — a progress update
   * that should overwrite the previous transient line of the same stream
   * rather than append to history.
   */
  transient: boolean
}

type InstallCleanupEvent = {
  stage: "started" | "finished"
  path: string
  deleted: boolean
  skippedReason: string | null
  error: string | null
}

type InstallDoneEvent = {
  success: boolean
  code: number | null
  message: string | null
  cancelled: boolean
}

type ServerState = {
  // Detection
  installs: DetectedInstall[]
  installed: boolean
  detecting: boolean
  refreshInstalls: () => Promise<void>

  // Onboarding modal
  installOpen: boolean
  setInstallOpen: (open: boolean) => void
  openInstall: () => void

  // Install lifecycle
  installStatus: InstallStatus
  installLog: InstallLogLine[]
  /**
   * The most recent transient (progress-update) line. Rendered after the
   * committed log so the console behaves like a real terminal: `\r`-only
   * updates overwrite a single live line instead of appending a new one.
   */
  installPending: InstallLogLine | null
  installExitCode: number | null
  startInstall: (choices: OnboardingChoices) => Promise<void>
  cancelInstall: () => Promise<void>
  resetInstall: () => void
}

const ServerStateContext = React.createContext<ServerState | null>(null)

export function ServerStateProvider({ children }: { children: React.ReactNode }) {
  const [installs, setInstalls] = React.useState<DetectedInstall[]>([])
  const [detecting, setDetecting] = React.useState(true)
  const [installOpen, setInstallOpen] = React.useState(false)

  const [installStatus, setInstallStatus] =
    React.useState<InstallStatus>("idle")
  const [installLog, setInstallLog] = React.useState<InstallLogLine[]>([])
  const [installPending, setInstallPending] =
    React.useState<InstallLogLine | null>(null)
  const [installExitCode, setInstallExitCode] = React.useState<number | null>(
    null
  )

  // Monotonic id so React keys are stable even if text repeats
  const lineCounter = React.useRef(0)
  const nextId = React.useCallback(() => ++lineCounter.current, [])

  const refreshInstalls = React.useCallback(async () => {
    if (!isTauri()) {
      setDetecting(false)
      return
    }
    setDetecting(true)
    try {
      const result = await trackedInvoke<{ installs: DetectedInstall[] }>(
        "detect_installs"
      )
      setInstalls(result.installs)
    } catch (err) {
      console.error("detect_installs failed", err)
      setInstalls([])
    } finally {
      setDetecting(false)
    }
  }, [])

  React.useEffect(() => {
    void refreshInstalls()
  }, [refreshInstalls])

  // Subscribe to install:* events for the whole app lifetime.
  //
  // Each listen() returns a Promise<UnlistenFn>. We start all three eagerly
  // and capture the promises so cleanup can `.then(unlisten => unlisten())`
  // them — that pattern is StrictMode- and HMR-safe: even if cleanup fires
  // before listen() resolves, the .then() runs whenever the promise lands
  // and calls unlisten immediately. The previous async-IIFE-with-cancelled-
  // flag pattern left listeners registered on the Rust side during the
  // window between mount-#2's effect and mount-#1's IIFE finishing, which
  // is why every line was rendering twice.
  React.useEffect(() => {
    if (!isTauri()) return

    const outputPromise = listen<InstallOutputEvent>("install:output", (e) => {
      const { stream, line, transient } = e.payload
      if (transient) {
        // Progress update — replace the pending slot. If the previous
        // pending belonged to a different stream, commit it to history
        // first so we don't lose it.
        setInstallPending((prev) => {
          if (prev && prev.stream !== stream) {
            setInstallLog((log) => [...log, prev])
          }
          return { id: nextId(), stream, text: line }
        })
      } else {
        // Final line — in a real terminal, this overwrites whatever was
        // sitting in the in-place row (e.g. "...100%\r" then
        // "...100%, done.\n" leaves only the second line visible). Mirror
        // that: when the pending is from the same stream, drop it and
        // just commit the final. Only preserve the pending if it came
        // from a different stream — that progress trail is unrelated to
        // this final line.
        setInstallPending((prev) => {
          if (prev && prev.stream !== stream) {
            setInstallLog((log) => [
              ...log,
              prev,
              { id: nextId(), stream, text: line },
            ])
          } else {
            setInstallLog((log) => [
              ...log,
              { id: nextId(), stream, text: line },
            ])
          }
          return null
        })
      }
    })

    const cleanupPromise = listen<InstallCleanupEvent>(
      "install:cleanup",
      (e) => {
        if (e.payload.stage === "started") {
          setInstallStatus("cleaning")
        }
        // The finished stage's outcome is already surfaced as system lines
        // via install:output (see perform_cleanup in install.rs), and
        // install:done is what flips us to the terminal state.
      }
    )

    const donePromise = listen<InstallDoneEvent>("install:done", (e) => {
      // Commit any in-flight transient line to history — once the script
      // is done, there will be no more updates to it.
      setInstallPending((prev) => {
        if (prev) {
          setInstallLog((log) => [...log, prev])
        }
        return null
      })
      setInstallExitCode(e.payload.code)
      const nextStatus: InstallStatus = e.payload.cancelled
        ? "cancelled"
        : e.payload.success
          ? "succeeded"
          : "failed"
      setInstallStatus(nextStatus)
      // The cleanup phase emits its own system lines (deleted / refused /
      // failed) right before this fires, so the cancelled message here
      // just needs to be a clean closing line.
      const msg = e.payload.cancelled
        ? "Installer cancelled."
        : e.payload.success
          ? `Installer exited cleanly (code ${e.payload.code ?? 0}).`
          : `Installer failed (code ${e.payload.code ?? "?"}${
              e.payload.message ? ": " + e.payload.message : ""
            }).`
      setInstallLog((prev) => [
        ...prev,
        { id: nextId(), stream: "system", text: msg },
      ])
      // After a successful install, re-scan so the UI flips to management.
      if (e.payload.success) {
        void refreshInstalls()
      }
    })

    return () => {
      void outputPromise.then((fn) => fn()).catch(() => {})
      void cleanupPromise.then((fn) => fn()).catch(() => {})
      void donePromise.then((fn) => fn()).catch(() => {})
    }
  }, [nextId, refreshInstalls])

  const startInstall = React.useCallback(
    async (choices: OnboardingChoices) => {
      if (!isTauri()) {
        // In the browser dev shell, just simulate the lifecycle so the
        // console screen can be styled without a running backend.
        setInstallStatus("running")
        setInstallPending(null)
        setInstallLog([
          {
            id: nextId(),
            stream: "system",
            text: "[browser preview] Tauri runtime not detected — no install will run.",
          },
        ])
        return
      }
      setInstallLog([])
      setInstallPending(null)
      setInstallExitCode(null)
      setInstallStatus("running")
      try {
        await trackedInvoke("start_install", {
          request: {
            serverType: choices.serverType,
            buildMethod: choices.buildMethod,
            adminUser: choices.adminUser,
            adminPass: choices.adminPass,
            force: choices.force ?? false,
          },
        })
      } catch (err) {
        setInstallStatus("failed")
        setInstallLog((prev) => [
          ...prev,
          {
            id: nextId(),
            stream: "system",
            text: `Failed to launch installer: ${String(err)}`,
          },
        ])
      }
    },
    [nextId]
  )

  const cancelInstall = React.useCallback(async () => {
    if (!isTauri()) {
      setInstallStatus("cancelled")
      return
    }
    setInstallStatus("cancelling")
    setInstallLog((prev) => [
      ...prev,
      {
        id: nextId(),
        stream: "system",
        text: "Cancelling… (sending SIGTERM to installer process group)",
      },
    ])
    try {
      await trackedInvoke<boolean>("cancel_install")
      // The actual transition to "cancelled" happens when the install:done
      // event lands. If nothing was running on the Rust side, we revert.
    } catch (err) {
      setInstallStatus("running")
      setInstallLog((prev) => [
        ...prev,
        {
          id: nextId(),
          stream: "system",
          text: `Cancel failed: ${String(err)}`,
        },
      ])
    }
  }, [nextId])

  const resetInstall = React.useCallback(() => {
    setInstallStatus("idle")
    setInstallLog([])
    setInstallPending(null)
    setInstallExitCode(null)
  }, [])

  const value = React.useMemo<ServerState>(
    () => ({
      installs,
      installed: installs.length > 0,
      detecting,
      refreshInstalls,
      installOpen,
      setInstallOpen,
      openInstall: () => setInstallOpen(true),
      installStatus,
      installLog,
      installPending,
      installExitCode,
      startInstall,
      cancelInstall,
      resetInstall,
    }),
    [
      installs,
      detecting,
      refreshInstalls,
      installOpen,
      installStatus,
      installLog,
      installPending,
      installExitCode,
      startInstall,
      cancelInstall,
      resetInstall,
    ]
  )

  return (
    <ServerStateContext.Provider value={value}>
      {children}
    </ServerStateContext.Provider>
  )
}

export function useServerState() {
  const ctx = React.useContext(ServerStateContext)
  if (!ctx) throw new Error("useServerState must be used inside ServerStateProvider")
  return ctx
}
