import * as React from "react"
import {
  ArrowRightIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { useServerState } from "@/components/server-state-context"

/**
 * Shown when an install dir + containers exist on disk but `install.json`
 * is missing. Two very different situations land here, and we tell them
 * apart by whether the worldserver is actually running:
 *
 *  - **Healthy + no marker** → an externally-installed server (e.g. from
 *    the original `install-wow.sh`, which doesn't write our metadata).
 *    The server works; we just "adopt" it — write the marker, no bootstrap.
 *
 *  - **Not healthy + no marker** → a UI install that crashed after
 *    clone/compile but before the post-server-ready bootstrap. "Finish
 *    setup" re-runs the script in resume mode (`DML_RESUME=1`) to complete
 *    accounts/AHBot — defaulting to admin/admin since the original wizard
 *    data is gone.
 */
export function InstallResumeBanner() {
  const {
    installed,
    installComplete,
    installs,
    installStatus,
    worldserverStatus,
    startInstall,
    adoptInstall,
  } = useServerState()
  const [adopting, setAdopting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Don't double-render once a resume is already running — the install
  // console screen takes over the main pane in that case.
  if (!installed || installComplete || installStatus !== "idle") return null

  // A running worldserver means the server is real and usable — this is an
  // external install to adopt, not a broken one to repair.
  const healthy = worldserverStatus === "running"

  if (healthy) {
    const onAdopt = async () => {
      setError(null)
      setAdopting(true)
      try {
        await adoptInstall()
      } catch (e) {
        setError(typeof e === "string" ? e : String(e))
      } finally {
        setAdopting(false)
      }
    }
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="flex-1 space-y-1.5">
            <div className="font-medium leading-tight">
              Existing server detected
            </div>
            <p className="text-xs text-emerald-700/90 dark:text-emerald-300/90">
              We found a running WoW server that was set up outside this app.
              Adopt it to manage it here — your accounts, characters, and
              settings are left exactly as they are.
            </p>
            {error && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => void onAdopt()}
            disabled={adopting}
            className="shrink-0 gap-1.5"
          >
            {adopting ? "Adopting…" : "Use this server"}
            {!adopting && <ArrowRightIcon className="size-4" />}
          </Button>
        </div>
      </div>
    )
  }

  const variant = installs[0]?.variant ?? "playerbots"
  const onResume = () => {
    void startInstall({
      // Resume always uses the existing install — no module choices,
      // no admin-cred prompts. variant comes from what's on disk.
      serverType:
        variant === "playerbots" || variant === "npcbots" || variant === "base"
          ? variant
          : "playerbots",
      adminUser: "admin",
      adminPass: "admin",
      resume: true,
    })
  }

  return (
    <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-rose-800 dark:text-rose-200">
      <div className="flex items-start gap-3">
        <WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-rose-600 dark:text-rose-400" />
        <div className="flex-1 space-y-1.5">
          <div className="font-medium leading-tight">
            Your install didn't finish
          </div>
          <p className="text-xs text-rose-700/90 dark:text-rose-300/90">
            The server was installed but the post-install setup (admin
            account, Auction House Bot character, config) didn't complete —
            probably from a crash or interrupted session. You won't be able
            to log into WoW until this finishes.
          </p>
          <p className="text-xs text-rose-700/90 dark:text-rose-300/90">
            Click below to pick up where we left off. This skips the long
            clone/compile (already done) and just finishes the account setup
            — usually under a minute.
          </p>
        </div>
        <Button size="sm" onClick={onResume} className="shrink-0 gap-1.5">
          Finish setup
          <ArrowRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
