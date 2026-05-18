import { DownloadSimpleIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  serializeLog,
  type InstallLogEntry,
  type InstallLogLine,
} from "@/components/server-state-context"

/**
 * Saves a console transcript as a plain .txt file via a Blob +
 * synthetic <a download> click — works in the Tauri webview and in any
 * browser without needing a Tauri command. Prepends a small diagnostic
 * header (timestamp, status, exit code) so a user pasting this to us
 * has enough context to triage with.
 *
 * Reused by both the install screen and the server-control screen so a
 * crash mid-start / mid-stop is just as recoverable for bug reports.
 */
export function DownloadLogButton({
  log,
  pending,
  status,
  exitCode,
  filenamePrefix,
}: {
  log: InstallLogEntry[]
  pending: InstallLogLine | null
  status: string
  exitCode: number | null
  filenamePrefix: string
}) {
  const isEmpty = log.length === 0 && !pending

  const onClick = () => {
    if (isEmpty) return
    const now = new Date()
    const header = [
      `# Dad's MMO Lab — ${filenamePrefix} log`,
      `# Generated: ${now.toISOString()}`,
      `# Status: ${status}${exitCode != null ? ` (exit ${exitCode})` : ""}`,
      `# Paste this transcript when reporting an issue.`,
      "",
      "",
    ].join("\n")
    const body = serializeLog(log, pending)
    const blob = new Blob([header + body + "\n"], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const stamp = now.toISOString().replace(/[:.]/g, "-")
    a.href = url
    a.download = `dads-mmo-lab-${filenamePrefix}-${stamp}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Defer revoke so the download has a tick to start before the
    // object URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 250)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={isEmpty}
      title={isEmpty ? "Nothing to download yet" : "Save the console transcript as .txt"}
    >
      <DownloadSimpleIcon className="size-4" />
      Download log
    </Button>
  )
}
