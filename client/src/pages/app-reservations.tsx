import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Smartphone, Users, Clock, Phone, CalendarDays, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { restaurantTables } from "@/lib/tables";
import type { Reservation } from "@shared/schema";

// ── helpers ───────────────────────────────────────────────────────────────────

function parseComments(raw: string) {
  const parts = (raw ?? "").split(" | ");
  let occasion = "";
  let email = "";
  const notes: string[] = [];
  for (const p of parts) {
    if (p.startsWith("Occasion: ")) occasion = p.slice("Occasion: ".length);
    else if (p.startsWith("Email: ")) email = p.slice("Email: ".length);
    else if (p.trim()) notes.push(p);
  }
  return { occasion, email, notes: notes.join(", ") };
}

// Sort slot labels by their start time
const SLOT_ORDER = [
  "9:00 AM - 10:30 AM",
  "10:00 AM - 12:00 PM",
  "10:45 AM - 12:15 PM",
  "12:00 PM - 2:00 PM",
  "12:30 PM - 2:30 PM",
  "2:30 PM - 4:30 PM",
  "4:30 PM - 6:30 PM",
  "6:45 PM - 8:15 PM",
  "8:30 PM - 10:00 PM",
];

function slotIndex(time: string) {
  const idx = SLOT_ORDER.indexOf(time);
  return idx === -1 ? 99 : idx;
}

function sortReservations(rs: Reservation[]) {
  return [...rs].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return slotIndex(a.time) - slotIndex(b.time);
  });
}

function friendlyDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), "EEE d MMM yyyy");
  } catch {
    return dateStr;
  }
}

// ── Assign Table Modal ────────────────────────────────────────────────────────

function AssignTableModal({
  reservation,
  allReservations,
  onClose,
}: {
  reservation: Reservation;
  allReservations: Reservation[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  // Tables already booked at this same date+time slot (excluding this reservation and TBC)
  const bookedIds = new Set(
    allReservations
      .filter(
        (r) =>
          r.id !== reservation.id &&
          r.date === reservation.date &&
          r.time === reservation.time &&
          r.tableId > 0 &&
          !["cancelled", "no-show"].includes(r.status)
      )
      .map((r) => r.tableId)
  );

  // Tables that physically fit the party size and aren't already booked
  const fittingTables = restaurantTables.filter(
    (t) => t.maxCapacity >= reservation.partySize && !bookedIds.has(t.id)
  );

  const assignMutation = useMutation({
    mutationFn: async ({ tableId, tableName }: { tableId: number; tableName: string }) =>
      apiRequest("PATCH", `/api/reservations/${reservation.id}`, { tableId, tableName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      toast({ title: "Table assigned", description: `Reservation moved to the main view.` });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Failed to assign table";
      if (msg.includes("double booking") || msg.includes("already booked")) {
        toast({
          title: "Table just taken",
          description: "Another staff member assigned that table first. Please choose another.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    },
  });

  function handleConfirm() {
    if (!selectedTableId) return;
    const table = restaurantTables.find((t) => t.id === selectedTableId);
    if (!table) return;
    assignMutation.mutate({ tableId: table.id, tableName: table.number });
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Table — {reservation.customerName}</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-1">
          Party of {reservation.partySize} · {friendlyDate(reservation.date)} · {reservation.time}
        </div>

        {fittingTables.length === 0 ? (
          <div className="py-6 text-center text-sm text-destructive font-medium">
            No tables available for a party of {reservation.partySize} at this slot.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto py-1">
            {fittingTables.map((t) => {
              const cap =
                t.minCapacity === t.maxCapacity
                  ? `${t.maxCapacity} seats`
                  : `${t.minCapacity}–${t.maxCapacity} seats`;
              const selected = selectedTableId === t.id;
              return (
                <button
                  key={t.id}
                  data-testid={`button-table-${t.id}`}
                  onClick={() => setSelectedTableId(t.id)}
                  className={[
                    "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-[#0D7377] bg-[#0D7377]/5 ring-1 ring-[#0D7377]"
                      : "border-border hover:border-muted-foreground hover:bg-muted/40",
                  ].join(" ")}
                >
                  <span className="font-semibold text-sm">Table {t.number}</span>
                  <span className="text-xs text-muted-foreground">{cap}</span>
                  <span className="text-xs text-muted-foreground">{t.section}</span>
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={assignMutation.isPending}>
            Cancel
          </Button>
          <Button
            data-testid="button-confirm-assign"
            onClick={handleConfirm}
            disabled={!selectedTableId || assignMutation.isPending || fittingTables.length === 0}
          >
            {assignMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Assigning…</>
            ) : (
              "Confirm Assignment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reservation Card ──────────────────────────────────────────────────────────

function AppReservationCard({
  reservation,
  allReservations,
}: {
  reservation: Reservation;
  allReservations: Reservation[];
}) {
  const [showAssign, setShowAssign] = useState(false);
  const { occasion, email, notes } = parseComments(reservation.comments ?? "");

  return (
    <div
      data-testid={`card-app-reservation-${reservation.id}`}
      className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-base leading-tight">{reservation.customerName}</div>
          {/* Phone — dominant, WhatsApp link */}
          <a
            href={`https://wa.me/${reservation.phoneNumber.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`link-whatsapp-${reservation.id}`}
            className="flex items-center gap-1.5 mt-1 text-sm font-medium text-[#0D7377] hover:underline"
          >
            <Phone className="h-3.5 w-3.5 flex-shrink-0" />
            <span data-testid={`text-phone-${reservation.id}`}>{reservation.phoneNumber}</span>
          </a>
          {/* Email — subtle secondary, only if present */}
          {email && (
            <div className="text-xs text-muted-foreground mt-0.5 ml-5">{email}</div>
          )}
        </div>
        <Badge
          data-testid={`badge-partysize-${reservation.id}`}
          className="text-sm px-3 py-1 shrink-0 bg-[#0D7377]/10 text-[#0D7377] border-[#0D7377]/20"
          variant="outline"
        >
          <Users className="h-3.5 w-3.5 mr-1.5" />
          {reservation.partySize} guests
        </Badge>
      </div>

      {/* Date + time */}
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          <span data-testid={`text-date-${reservation.id}`}>{friendlyDate(reservation.date)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span data-testid={`text-time-${reservation.id}`}>{reservation.time}</span>
        </span>
      </div>

      {/* Occasion / notes */}
      {(occasion || notes) && (
        <div className="text-sm text-muted-foreground border-t border-border pt-2 flex flex-col gap-0.5">
          {occasion && <span><span className="font-medium text-foreground">Occasion:</span> {occasion}</span>}
          {notes && <span data-testid={`text-notes-${reservation.id}`}>{notes}</span>}
        </div>
      )}

      {/* Action */}
      <Button
        data-testid={`button-assign-${reservation.id}`}
        className="w-full bg-[#0D7377] hover:bg-[#0D7377]/90 text-white mt-1"
        onClick={() => setShowAssign(true)}
      >
        Assign to Table
      </Button>

      {showAssign && (
        <AssignTableModal
          reservation={reservation}
          allReservations={allReservations}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppReservationsPage() {
  const { data: allReservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const appBookings = sortReservations(
    allReservations.filter(
      (r) =>
        r.takenBy === "seated-b2c" &&
        r.tableId === 0 &&
        !["cancelled", "no-show"].includes(r.status)
    )
  );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-[#0D7377]/10">
          <Smartphone className="h-5 w-5 text-[#0D7377]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">App Reservations</h1>
          <p className="text-sm text-muted-foreground">
            Online bookings awaiting table assignment
          </p>
        </div>
        {!isLoading && (
          <Badge variant="secondary" className="ml-auto text-sm px-3">
            {appBookings.length} pending
          </Badge>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : appBookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-500/60" />
          <div>
            <p className="font-medium text-base text-foreground">All caught up</p>
            <p className="text-sm mt-1">No app bookings awaiting a table assignment.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {appBookings.map((r) => (
            <AppReservationCard
              key={r.id}
              reservation={r}
              allReservations={allReservations}
            />
          ))}
        </div>
      )}
    </div>
  );
}
