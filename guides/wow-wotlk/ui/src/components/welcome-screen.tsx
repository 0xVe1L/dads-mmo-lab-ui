import { ArrowRightIcon } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { useServerState } from "@/components/server-state-context"

export function WelcomeScreen() {
  const { openInstall } = useServerState()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      {/* Logo placeholder — replace with the Dad's MMO Lab graphic. */}
      <div className="flex size-64 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
        Logo placeholder
      </div>

      <p className="text-center text-xl font-medium text-foreground">
        Install server to get started
      </p>

      <Button
        size="lg"
        onClick={openInstall}
        className="h-12 gap-2 px-8 text-base [&_svg]:size-5"
      >
        Install Server
        <ArrowRightIcon />
      </Button>
    </div>
  )
}
