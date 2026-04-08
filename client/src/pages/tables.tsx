import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Reservation } from "@shared/schema";
import { format, addDays, subDays, isToday } from "date-fns";
import { restaurantTables, TABLE_SECTIONS, getTablesBySection, type TableSection } from "@/lib/tables";
import { getTimeSlotsForDate, getPeriodLabel } from "@/lib/timeSlots";

export default function TablesPage() {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const slots = getTimeSlotsForDate(selectedDate);

  useEffect(() => {
    setSelectedSlot(null);
  }, [dateStr]);

  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const activeReservations = reservations.filter((r) => {
    if (r.date !== dateStr) return false;
    if (r.status === "complete" || r.status === "cancelled" || r.status === "no-show") return false;
    if (selectedSlot && r.time !== selectedSlot) return false;
    return true;
  });

  const getTableStatus = (tableId: number) => {
    const reservation = activeReservations.find((r) => r.tableId === tableId);
    if (!reservation) return { status: "available" as const, reservation: null };
    return { status: reservation.status as "booked" | "confirmed" | "seated" | "no-show", reservation };
  };

  const availableCount = restaurantTables.filter(
    (t) => getTableStatus(t.id).status === "available"
  ).length;

  const occupiedCount = restaurantTables.length - availableCount;

  const dateLabel = isToday(selectedDate)
    ? "Today"
    : format(selectedDate, "EEEE, MMM d, yyyy");

  const renderTableCard = (table: ReturnType<typeof getTablesBySection>[0]) => {
    const { status, reservation } = getTableStatus(table.id);
    const isAvailable = status === "available";

    const handleCardClick = () => {
      if (!isAvailable && reservation) {
        navigate(`/?date=${dateStr}&slot=${encodeURIComponent(reservation.time)}`);
      } else if (isAvailable) {
        const slotParam = selectedSlot ? `&slot=${encodeURIComponent(selectedSlot)}` : "";
        navigate(`/new-reservation?tableId=${table.id}&tableNumber=${encodeURIComponent(table.number)}&date=${dateStr}${slotParam}`);
      }
    };

    return (
      <Card
        key={table.id}
        className={`p-4 flex flex-col items-center justify-center transition-colors cursor-pointer ${
          isAvailable
            ? "bg-white hover:bg-green-50 hover:ring-1 hover:ring-green-300"
            : "bg-[#0D7377]/5 ring-1 ring-[#0D7377]/20 hover:bg-[#0D7377]/10"
        }`}
        onClick={handleCardClick}
        data-testid={`table-card-${table.id}`}
      >
        <svg width="48" height="32" viewBox="0 0 48 32" fill="none" className="mb-3">
          <rect x="8" y="12" width="32" height="4" fill={isAvailable ? "#94a3b8" : "#0D7377"} rx="1" />
          <rect x="10" y="16" width="2" height="12" fill={isAvailable ? "#94a3b8" : "#0D7377"} />
          <rect x="36" y="16" width="2" height="12" fill={isAvailable ? "#94a3b8" : "#0D7377"} />
          <rect x="2" y="8" width="8" height="16" rx="2" stroke={isAvailable ? "#94a3b8" : "#0D7377"} strokeWidth="1.5" fill="none" />
          <rect x="38" y="8" width="8" height="16" rx="2" stroke={isAvailable ? "#94a3b8" : "#0D7377"} strokeWidth="1.5" fill="none" />
        </svg>
        <span className="font-medium text-foreground text-center" data-testid={`text-table-number-${table.id}`}>
          Table {table.number}
        </span>
        <span className="text-xs text-muted-foreground mb-[8px] mt-[2px]">
          {table.minCapacity === table.maxCapacity
            ? `${table.minCapacity} seats`
            : `${table.minCapacity}–${table.maxCapacity} seats`}
        </span>
        {isAvailable ? (
          <div className="flex flex-col items-center gap-1">
            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50" data-testid={`badge-status-${table.id}`}>
              Available
            </Badge>
            <span className="text-[10px] text-muted-foreground/60">Tap to book</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Badge className="bg-[#0D7377] text-white" data-testid={`badge-status-${table.id}`}>
              {status === "seated" ? "Seated" : status === "confirmed" ? "Confirmed" : status === "booked" ? "Booked" : "Pending"}
            </Badge>
            {reservation && (
              <span className="text-xs text-muted-foreground mt-1 text-center" data-testid={`text-guest-${table.id}`}>
                {reservation.customerName} · {reservation.time}
              </span>
            )}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-4 border-b pb-4 sm:pb-6">
          <div>
            <h1 className="text-lg sm:text-2xl font-semibold text-foreground mb-0.5 sm:mb-1" data-testid="text-page-title">Tables</h1>
            <p className="text-xs sm:text-sm text-muted-foreground" data-testid="text-page-subtitle">
              View all tables and their availability.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500" />
              <span className="text-xs sm:text-sm text-muted-foreground" data-testid="text-available-count">{availableCount} Available</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#0D7377]" />
              <span className="text-xs sm:text-sm text-muted-foreground" data-testid="text-occupied-count">{occupiedCount} Occupied</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mb-4">
          <Button size="icon" variant="ghost" onClick={() => setSelectedDate(subDays(selectedDate, 1))} data-testid="button-date-prev">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-base font-medium text-foreground min-w-[200px] text-center" data-testid="text-selected-date">
            {dateLabel}
          </span>
          <Button size="icon" variant="ghost" onClick={() => setSelectedDate(addDays(selectedDate, 1))} data-testid="button-date-next">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {slots.map((slot) => (
            <Badge
              key={slot.label}
              variant={selectedSlot === slot.label ? "default" : "outline"}
              className={`cursor-pointer whitespace-nowrap px-3 py-1.5 text-xs shrink-0 ${selectedSlot === slot.label ? "bg-[#0D7377] text-white border-[#0D7377]" : ""}`}
              onClick={() => setSelectedSlot(slot.label === selectedSlot ? null : slot.label)}
              data-testid={`slot-filter-${slot.label.replace(/[\s:]/g, "-")}`}
            >
              {getPeriodLabel(slot.period)} · {slot.label}
            </Badge>
          ))}
        </div>

        <div className="space-y-8">
          {TABLE_SECTIONS.map((section: TableSection) => {
            const tables = getTablesBySection(section);
            return (
              <div key={section}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                    {section}
                  </h2>
                  <div className="h-px bg-border flex-1" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {tables.map(renderTableCard)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
