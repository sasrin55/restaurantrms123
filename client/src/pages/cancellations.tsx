import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatName } from "@/lib/utils";
import { format, addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Users, Clock, Phone, Table2, XCircle, AlertTriangle, CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Reservation } from "@shared/schema";

export default function CancellationsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const dateLabel = isToday(selectedDate)
    ? "Today"
    : format(selectedDate, "EEEE, d MMM yyyy");

  const entries = reservations.filter(
    (r) => r.date === dateStr && (r.status === "cancelled" || r.status === "no-show")
  );

  const cancelled = entries.filter((r) => r.status === "cancelled");
  const noShows   = entries.filter((r) => r.status === "no-show");

  const totalPaxLost = entries.reduce((sum, r) => sum + r.partySize, 0);

  function EntryRow({ r }: { r: Reservation }) {
    const isNoShow = r.status === "no-show";
    return (
      <div
        className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors"
        data-testid={`row-cancellation-${r.id}`}
      >
        <div className="shrink-0">
          {isNoShow ? (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </span>
          ) : (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-100">
              <XCircle className="h-4 w-4 text-rose-500" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-foreground">{formatName(r.customerName)}</p>
            <Badge
              className={isNoShow
                ? "bg-orange-100 text-orange-700 border-orange-200 font-medium text-[11px]"
                : "bg-rose-100 text-rose-700 border-rose-200 font-medium text-[11px]"
              }
              variant="outline"
            >
              {isNoShow ? "No-Show" : "Cancelled"}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" /> {r.partySize} {r.partySize === 1 ? "guest" : "guests"}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> {r.time}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Table2 className="h-3 w-3" /> {r.tableName}
            </span>
            {r.phoneNumber && r.phoneNumber !== "0" && r.phoneNumber !== "any" && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" /> {r.phoneNumber}
              </span>
            )}
            {r.comments && (
              <span className="text-xs text-muted-foreground italic truncate max-w-[200px]">"{r.comments}"</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="border-b pb-4">
          <h1 className="text-lg sm:text-2xl font-semibold text-foreground" data-testid="text-page-title">
            Cancellations & No-Shows
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Track cancelled reservations and guests who didn't show up.
          </p>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-center gap-4">
          <Button
            size="icon" variant="ghost"
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            data-testid="btn-date-prev"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span
            className="text-base font-medium text-foreground min-w-[220px] text-center"
            data-testid="text-selected-date"
          >
            {dateLabel}
          </span>
          <Button
            size="icon" variant="ghost"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            data-testid="btn-date-next"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border rounded-xl p-4 text-center" data-testid="card-total">
            <p className="text-2xl font-bold text-foreground">{entries.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center" data-testid="card-cancelled">
            <p className="text-2xl font-bold text-rose-600">{cancelled.length}</p>
            <p className="text-xs text-rose-500 mt-0.5">Cancelled</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center" data-testid="card-noshows">
            <p className="text-2xl font-bold text-orange-600">{noShows.length}</p>
            <p className="text-xs text-orange-500 mt-0.5">No-Shows</p>
          </div>
        </div>

        {totalPaxLost > 0 && (
          <div className="bg-muted/40 border rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 shrink-0" />
            <span><span className="font-semibold text-foreground">{totalPaxLost} covers</span> lost to cancellations and no-shows on this day.</span>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CalendarX className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No cancellations or no-shows for {dateLabel.toLowerCase()}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {noShows.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                    No-Shows ({noShows.length})
                  </span>
                  <div className="h-px bg-border flex-1" />
                </div>
                <div className="rounded-xl border overflow-hidden divide-y">
                  {noShows.map(r => <EntryRow key={r.id} r={r} />)}
                </div>
              </div>
            )}

            {cancelled.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                    Cancelled ({cancelled.length})
                  </span>
                  <div className="h-px bg-border flex-1" />
                </div>
                <div className="rounded-xl border overflow-hidden divide-y">
                  {cancelled.map(r => <EntryRow key={r.id} r={r} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
