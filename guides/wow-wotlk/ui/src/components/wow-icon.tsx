import wowIconUrl from "@/assets/icons/icons8-world-of-warcraft-480.svg"
import { cn } from "@/lib/utils"

export function WowIcon({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <img
      src={wowIconUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={cn("shrink-0", className)}
    />
  )
}
