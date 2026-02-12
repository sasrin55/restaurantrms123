import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Reservation } from "@shared/schema";
import { format } from "date-fns";

const restaurantTables = [
  { id: 1, number: 1, minCapacity: 4, maxCapacity: 6 },
  { id: 2, number: 2, minCapacity: 4, maxCapacity: 6 },
  { id: 3, number: 3, minCapacity: 2, maxCapacity: 2 },
  { id: 4, number: 4, minCapacity: 2, maxCapacity: 2 },
  { id: 5, number: 5, minCapacity: 8, maxCapacity: 10 },
  { id: 6, number: 6, minCapacity: 3, maxCapacity: 3 },
  { id: 7, number: 7, minCapacity: 4, maxCapacity: 4 },
  { id: 8, number: 8, minCapacity: 2, maxCapacity: 2 },
  { id: 9, number: 9, minCapacity: 2, maxCapacity: 2 },
  { id: 10, number: 10, minCapacity: 2, maxCapacity: 2 },
  { id: 11, number: 11, minCapacity: 8, maxCapacity: 10 },
  { id: 12, number: 12, minCapacity: 3, maxCapacity: 4 },
  { id: 13, number: 13, minCapacity: 3, maxCapacity: 4 },
  { id: 14, number: 14, minCapacity: 4, maxCapacity: 6 },
];

export default function TablesPage() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const todaysActiveReservations = reservations.filter(
    (r) => r.date === today && r.status !== "complete"
  );

  const getTableStatus = (tableId: number) => {
    const reservation = todaysActiveReservations.find((r) => r.tableId === tableId);
    if (!reservation) return { status: "available" as const, reservation: null };
    return { status: reservation.status as "confirmed" | "seated" | "pending", reservation };
  };

  const availableCount = restaurantTables.filter(
    (t) => getTableStatus(t.id).status === "available"
  ).length;

  const occupiedCount = restaurantTables.length - availableCount;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6 border-b pb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1" data-testid="text-page-title">Tables</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              View all tables and their current availability for today.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-muted-foreground" data-testid="text-available-count">{availableCount} Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#0D7377]" />
              <span className="text-sm text-muted-foreground" data-testid="text-occupied-count">{occupiedCount} Occupied</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {restaurantTables.map((table) => {
            const { status, reservation } = getTableStatus(table.id);
            const isAvailable = status === "available";

            return (
              <Card
                key={table.id}
                className={`p-4 flex flex-col items-center justify-center ${
                  isAvailable ? "bg-white" : "bg-[#0D7377]/5 ring-1 ring-[#0D7377]/20"
                }`}
                data-testid={`table-card-${table.id}`}
              >
                <svg width="48" height="32" viewBox="0 0 48 32" fill="none" className="mb-3">
                  <rect x="8" y="12" width="32" height="4" fill={isAvailable ? "#94a3b8" : "#0D7377"} rx="1" />
                  <rect x="10" y="16" width="2" height="12" fill={isAvailable ? "#94a3b8" : "#0D7377"} />
                  <rect x="36" y="16" width="2" height="12" fill={isAvailable ? "#94a3b8" : "#0D7377"} />
                  <rect x="2" y="8" width="8" height="16" rx="2" stroke={isAvailable ? "#94a3b8" : "#0D7377"} strokeWidth="1.5" fill="none" />
                  <rect x="38" y="8" width="8" height="16" rx="2" stroke={isAvailable ? "#94a3b8" : "#0D7377"} strokeWidth="1.5" fill="none" />
                </svg>

                <span className="font-medium text-foreground" data-testid={`text-table-number-${table.id}`}>
                  Table {table.number}
                </span>
                <span className="text-xs text-muted-foreground mb-2">
                  {table.minCapacity === table.maxCapacity
                    ? `${table.minCapacity} seats`
                    : `${table.minCapacity} to ${table.maxCapacity} seats`}
                </span>

                {isAvailable ? (
                  <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50" data-testid={`badge-status-${table.id}`}>
                    Available
                  </Badge>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Badge className="bg-[#0D7377] text-white" data-testid={`badge-status-${table.id}`}>
                      {status === "seated" ? "Seated" : status === "confirmed" ? "Reserved" : "Pending"}
                    </Badge>
                    {reservation && (
                      <span className="text-xs text-muted-foreground mt-1" data-testid={`text-guest-${table.id}`}>
                        {reservation.customerName}
                      </span>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
