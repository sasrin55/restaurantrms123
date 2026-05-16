import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatName } from "@/lib/utils";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Trash2, ArrowRight, Clock, Users, Phone } from "lucide-react";
import type { Reservation } from "@shared/schema";
import { format, addDays, subDays, isToday } from "date-fns";
import { restaurantTables, TABLE_SECTIONS, getTablesBySection, type TableSection } from "@/lib/tables";
import { getPeriodLabel, getTimePeriodForLabel, ALL_SLOTS } from "@/lib/timeSlots";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function TablesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    setSelectedSlot(null);
  }, [dateStr]);

  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/reservations/${id}/status`, { status: "cancelled" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      setSelectedReservation(null);
      toast({ title: "Reservation removed", description: "The reservation has been cancelled." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not cancel the reservation.", variant: "destructive" });
    },
  });

  // Derive time-slot chips from actual reservation times for this day (handles legacy labels)
  const todaysReservations = reservations.filter(
    (r) => r.date === dateStr && r.status !== "complete" && r.status !== "cancelled" && r.status !== "no-show"
  );

  const parseStartMinutes = (label: string): number => {
    const start = label.split("-")[0].trim(); // "4:30 PM"
    const [timePart, ampm] = start.split(" ");
    const [h, m] = timePart.split(":").map(Number);
    const hours = ampm === "PM" && h !== 12 ? h + 12 : ampm === "AM" && h === 12 ? 0 : h;
    return hours * 60 + (m || 0);
  };

  const slots = Array.from(new Set(todaysReservations.map((r) => r.time)))
    .map((label) => ({
      label,
      period: getTimePeriodForLabel(label) ?? (ALL_SLOTS.find(s => s.label === label)?.period ?? "dinner"),
    }))
    .sort((a, b) => parseStartMinutes(a.label) - parseStartMinutes(b.label));

  const activeReservations = todaysReservations.filter((r) => {
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

  const STATUS_STYLE: Record<string, { badge: string; card: string; icon: string }> = {
    booked:    { badge: "bg-blue-500 text-white",    card: "bg-blue-50 ring-1 ring-blue-200 hover:bg-blue-100",       icon: "#3b82f6" },
    confirmed: { badge: "bg-green-600 text-white",   card: "bg-green-50 ring-1 ring-green-300 hover:bg-green-100",    icon: "#16a34a" },
    seated:    { badge: "bg-[#4A5D23] text-white",   card: "bg-[#4A5D23]/5 ring-1 ring-[#4A5D23]/30 hover:bg-[#4A5D23]/10", icon: "#4A5D23" },
    "no-show": { badge: "bg-orange-500 text-white",  card: "bg-orange-50 ring-1 ring-orange-200 hover:bg-orange-100", icon: "#f97316" },
  };

  const STATUS_LABEL: Record<string, string> = {
    booked: "Booked", confirmed: "Confirmed", seated: "Seated", "no-show": "No Show",
  };

  const renderTableCard = (table: ReturnType<typeof getTablesBySection>[0]) => {
    const { status, reservation } = getTableStatus(table.id);
    const isAvailable = status === "available";
    const style = STATUS_STYLE[status] ?? STATUS_STYLE["booked"];
    const iconColor = isAvailable ? "#94a3b8" : style.icon;

    const handleCardClick = () => {
      if (!isAvailable && reservation) {
        setSelectedReservation(reservation);
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
            : style.card
        }`}
        onClick={handleCardClick}
        data-testid={`table-card-${table.id}`}
      >
        <svg width="48" height="32" viewBox="0 0 48 32" fill="none" className="mb-3">
          <rect x="8" y="12" width="32" height="4" fill={iconColor} rx="1" />
          <rect x="10" y="16" width="2" height="12" fill={iconColor} />
          <rect x="36" y="16" width="2" height="12" fill={iconColor} />
          <rect x="2" y="8" width="8" height="16" rx="2" stroke={iconColor} strokeWidth="1.5" fill="none" />
          <rect x="38" y="8" width="8" height="16" rx="2" stroke={iconColor} strokeWidth="1.5" fill="none" />
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
            <Badge className={style.badge} data-testid={`badge-status-${table.id}`}>
              {STATUS_LABEL[status] ?? status}
            </Badge>
            {reservation && (
              <>
                <span className="font-medium text-foreground text-center mt-1 text-sm leading-tight" data-testid={`text-guest-${table.id}`}>
                  {formatName(reservation.customerName)}
                </span>
                <span className="text-[11px] text-muted-foreground text-center">{reservation.time}</span>
              </>
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

      {/* Reservation action dialog */}
      <Dialog open={!!selectedReservation} onOpenChange={(open) => { if (!open) setSelectedReservation(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedReservation?.tableName}</DialogTitle>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-3 py-1">
              <p className="font-semibold text-foreground text-lg">{selectedReservation.customerName}</p>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{selectedReservation.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0" />
                  <span>{selectedReservation.partySize} {selectedReservation.partySize === 1 ? "person" : "people"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{selectedReservation.phoneNumber}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                if (selectedReservation) {
                  navigate(`/?date=${dateStr}&slot=${encodeURIComponent(selectedReservation.time)}`);
                  setSelectedReservation(null);
                }
              }}
              data-testid="button-table-view-reservation"
            >
              <ArrowRight className="h-4 w-4" />
              View in Reservations
            </Button>
            <Button
              className="w-full gap-2 bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => selectedReservation && cancelMutation.mutate(selectedReservation.id)}
              disabled={cancelMutation.isPending}
              data-testid="button-table-cancel-reservation"
            >
              <Trash2 className="h-4 w-4" />
              {cancelMutation.isPending ? "Removing…" : "Remove Reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
