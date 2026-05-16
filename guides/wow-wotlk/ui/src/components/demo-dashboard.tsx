import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { DataTable } from "@/components/data-table"
import { Greet } from "@/components/greet"
import { SectionCards } from "@/components/section-cards"
import data from "@/app/dashboard/data.json"

// Preserved starter-kit demo content. Surfaced when a server install is detected;
// good reference for chart, card, and data-table patterns when we build the real
// server dashboard later.
export function DemoDashboard() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards />
        <div className="px-4 lg:px-6">
          <Greet />
        </div>
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div>
        <DataTable data={data} />
      </div>
    </div>
  )
}
