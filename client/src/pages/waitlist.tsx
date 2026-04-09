import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { restaurantTables } from "@/lib/tables";
import { getTimeSlotsForDate, getPeriodLabel } from "@/lib/timeSlots";
import { format } from "date-fns";
import { Users, Clock, Phone, Plus, X, Check, Trash2 } from "lucide-react";
import type { Reservation } from "@shared/schema";

type WaitlistStatus = "waiting" | "notified" | "seated" | "cancelled" | "booked";

interface WaitlistEntry {
  id: string;
  guestName: string;
  phone: string;
  partySize: number;
  notes: string;
  joinedAt: number;
  estimatedWaitMins: number;
  notified: boolean;
  notifiedAt: number | null;
  status: WaitlistStatus;
  preferredDate: string;
  preferredTime: string;
  preferredTableId: number | null;
}

function elapsedMins(joinedAt: number): number {
  return Math.floor((Date.now() - joinedAt) / 60000);
}

function formatElapsed(joinedAt: number): string {
  const mins = elapsedMins(joinedAt);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

const statusConfig: Record<WaitlistStatus, { label: string; className: string }> = {
  waiting:   { label: "Waiting",   className: "bg-amber-100 text-amber-800 border-amber-200" },
  notified:  { label: "Notified",  className: "bg-blue-100 text-blue-800 border-blue-200" },
  seated:    { label: "Seated",    className: "bg-green-100 text-green-800 border-green-200" },
  booked:    { label: "Booked",    className: "bg-green-100 text-green-800 border-green-200" },
  cancelled: { label: "Left",      className: "bg-rose-100 text-rose-700 border-rose-200" },
};

// ── Seat Modal ─────────────────────────────────────────────────────────────
interface SeatModalProps {
  entry: WaitlistEntry;
  onClose: () => void;
  onSeated: (entryId: string) => void;
}

function SeatModal({ entry, onClose, onSeated }: SeatModalProps) {
  const { toast } = useToast();
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const reservationTime = entry.preferredTime || format(new Date(), "h:mm a");

  const { data: allReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const occupiedTableIds = new Set(
    allReservations
      .filter(r => {
        if (r.date !== todayStr) return false;
        if (r.status === "complete" || r.status === "cancelled" || r.status === "no-show") return false;
        if (entry.preferredTime) return r.time === entry.preferredTime;
        return r.status === "seated" || r.status === "booked" || r.status === "confirmed";
      })
      .map(r => r.tableId)
  );

  const createReservation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/reservations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
    },
  });

  async function handleConfirm() {
    if (!selectedTableId) return;
    const table = restaurantTables.find(t => t.id === selectedTableId)!;
    try {
      await createReservation.mutateAsync({
        customerName: entry.guestName,
        phoneNumber: entry.phone || "0",
        date: todayStr,
        time: reservationTime,
        partySize: entry.partySize,
        tableId: table.id,
        tableName: `Table ${table.number}`,
        comments: entry.notes ? `Walk-in — ${entry.notes}` : "Walk-in",
        status: "seated",
      });
      toast({ title: `${entry.guestName} seated at Table ${table.number}` });
      onSeated(entry.id);
      onClose();
    } catch (err: any) {
      toast({ title: "Failed to seat guest", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Seat {entry.guestName}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Party of {entry.partySize}
            {entry.preferredTime && <> · <span className="font-medium">{entry.preferredTime}</span></>}
            {" "}— select an available table
          </p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto py-1">
          {restaurantTables.map(table => {
            const occupied = occupiedTableIds.has(table.id);
            const fits = table.maxCapacity >= entry.partySize;
            const selected = selectedTableId === table.id;
            return (
              <button
                key={table.id}
                onClick={() => !occupied && setSelectedTableId(table.id)}
                disabled={occupied}
                data-testid={`btn-table-${table.number}`}
                className={[
                  "rounded-xl border p-3 text-left transition-all",
                  occupied
                    ? "opacity-40 cursor-not-allowed bg-gray-50"
                    : selected
                    ? "border-[#0D7377] bg-teal-50 ring-1 ring-[#0D7377]"
                    : fits
                    ? "border-gray-200 hover:border-[#0D7377] hover:bg-teal-50 cursor-pointer"
                    : "border-dashed border-gray-300 bg-gray-50 cursor-pointer",
                ].join(" ")}
              >
                <p className="font-semibold text-sm text-gray-900">Table {table.number}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {table.minCapacity === table.maxCapacity
                    ? `${table.maxCapacity} seats`
                    : `${table.minCapacity}–${table.maxCapacity} seats`}
                </p>
                {occupied && <p className="text-xs text-rose-500 mt-1">Occupied</p>}
                {!occupied && !fits && <p className="text-xs text-amber-500 mt-1">Too small</p>}
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selectedTableId || createReservation.isPending}
            onClick={handleConfirm}
            className="bg-[#0D7377] text-white hover:bg-[#0a5f63]"
            data-testid="btn-confirm-seat"
          >
            {createReservation.isPending ? "Seating…" : "Confirm Seat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Waitlist row ────────────────────────────────────────────────────────────
interface WaitlistRowProps {
  entry: WaitlistEntry;
  idx: number;
  onSeat: () => void;
  onCantSeat: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function WaitlistRow({ entry, idx, onSeat, onCantSeat, onDelete, isDeleting }: WaitlistRowProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-4 hover:bg-muted/20 transition-colors"
      data-testid={`row-waitlist-${entry.id}`}
    >
      <span className="text-lg font-bold text-muted-foreground w-6 shrink-0 text-center">{idx + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-base text-foreground">{entry.guestName}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5" />{entry.partySize} people
          </span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />{formatElapsed(entry.joinedAt)}
          </span>
          {entry.phone && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />{entry.phone}
            </span>
          )}
          {entry.notes && (
            <span className="text-sm text-muted-foreground italic">{entry.notes}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onSeat}
          data-testid={`btn-seat-${entry.id}`}
          className="w-12 h-12 rounded-xl bg-green-500 hover:bg-green-600 active:scale-95 transition-all flex items-center justify-center shadow-sm"
          title="Seat guest"
        >
          <Check className="h-6 w-6 text-white stroke-[3]" />
        </button>
        <button
          onClick={onCantSeat}
          data-testid={`btn-remove-${entry.id}`}
          className="w-12 h-12 rounded-xl bg-rose-500 hover:bg-rose-600 active:scale-95 transition-all flex items-center justify-center shadow-sm"
          title="Can't seat — remove from waitlist"
        >
          <X className="h-6 w-6 text-white stroke-[3]" />
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          data-testid={`btn-delete-${entry.id}`}
          className="w-9 h-9 rounded-lg border border-gray-200 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500 text-muted-foreground active:scale-95 transition-all flex items-center justify-center"
          title="Delete from waitlist"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function WaitlistPage() {
  const { toast } = useToast();
  const [seatEntry, setSeatEntry] = useState<WaitlistEntry | null>(null);

  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState("");
  const [notes, setNotes] = useState("");
  const [preferredTime, setPreferredTime] = useState("");

  const todaySlots = getTimeSlotsForDate(new Date());

  const { data: waitlist = [], isLoading } = useQuery<WaitlistEntry[]>({
    queryKey: ["/api/waitlist"],
    refetchInterval: 30000,
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/waitlist", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...updates }: any) => apiRequest("PATCH", `/api/waitlist/${id}`, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/waitlist/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] }),
    onError: () => toast({ title: "Failed to delete entry", variant: "destructive" }),
  });

  function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim() || !partySize) return;
    addMutation.mutate({
      guestName: guestName.trim(),
      phone: phone.trim(),
      partySize: parseInt(partySize),
      notes: notes.trim(),
      joinedAt: Date.now(),
      estimatedWaitMins: 20,
      preferredTime: preferredTime || "",
      preferredDate: format(new Date(), "yyyy-MM-dd"),
    }, {
      onSuccess: () => {
        setGuestName(""); setPhone(""); setPartySize(""); setNotes(""); setPreferredTime("");
        toast({ title: `${guestName.trim()} added to waitlist` });
      },
    });
  }

  function handleSeated(entryId: string) {
    updateMutation.mutate({ id: entryId, status: "seated" });
  }

  function handleCantSeat(id: string) {
    updateMutation.mutate({ id, status: "cancelled" });
  }

  const active = waitlist.filter(e => e.status === "waiting" || e.status === "notified");
  const done   = waitlist.filter(e => e.status !== "waiting" && e.status !== "notified");

  // Group active entries by preferredTime slot (in slot order), then "No time" at end
  const slotGroups: Array<{ slotLabel: string; period: string; entries: WaitlistEntry[] }> = [];
  const noTimeEntries: WaitlistEntry[] = [];

  for (const slot of todaySlots) {
    const entries = active.filter(e => e.preferredTime === slot.label);
    if (entries.length > 0) {
      slotGroups.push({ slotLabel: slot.label, period: getPeriodLabel(slot.period), entries });
    }
  }

  for (const entry of active) {
    const inASlot = todaySlots.some(s => s.label === entry.preferredTime);
    if (!inASlot) noTimeEntries.push(entry);
  }

  const hasSlots = slotGroups.length > 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-lg sm:text-2xl font-semibold text-foreground" data-testid="text-waitlist-title">
            Waitlist
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Walk-in guests waiting for a table
          </p>
        </div>

        {/* Add guest form */}
        <div className="bg-card border rounded-xl p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Guest
          </h2>
          <form onSubmit={handleAddGuest}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <Label className="text-xs">Guest Name *</Label>
                <Input
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Ali Khan"
                  required
                  data-testid="input-guest-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+92300…"
                  data-testid="input-phone"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Party Size *</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={partySize}
                  onChange={e => setPartySize(e.target.value)}
                  placeholder="2"
                  required
                  data-testid="input-party-size"
                />
              </div>
              <div className="col-span-2 sm:col-span-2 space-y-1">
                <Label className="text-xs">Time Slot</Label>
                <Select value={preferredTime || "any"} onValueChange={v => setPreferredTime(v === "any" ? "" : v)}>
                  <SelectTrigger data-testid="select-preferred-time">
                    <SelectValue placeholder="Any slot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any slot</SelectItem>
                    {todaySlots.map(slot => (
                      <SelectItem key={slot.label} value={slot.label}>
                        {getPeriodLabel(slot.period)} · {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any preferences…"
                  data-testid="input-notes"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={addMutation.isPending}
              className="bg-[#0D7377] text-white hover:bg-[#0a5f63] w-full sm:w-auto"
              data-testid="btn-add-waitlist"
            >
              {addMutation.isPending ? "Adding…" : "Add to Waitlist"}
            </Button>
          </form>
        </div>

        {/* Active waitlist — grouped by time slot */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">
            Waiting ({active.length}){active.length === 0 && !isLoading && <span className="ml-2 text-xs font-normal text-muted-foreground">— no guests waiting</span>}
          </h2>

          {/* Slot groups */}
          {slotGroups.map(({ slotLabel, period, entries }) => (
            <div key={slotLabel} className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                  {period} · {slotLabel}
                </span>
                <div className="h-px bg-border flex-1" />
                <span className="text-xs text-muted-foreground shrink-0">{entries.length} waiting</span>
              </div>
              <div className="rounded-xl border overflow-hidden divide-y">
                {entries.map((entry, idx) => (
                  <WaitlistRow
                    key={entry.id}
                    entry={entry}
                    idx={idx}
                    onSeat={() => setSeatEntry(entry)}
                    onCantSeat={() => handleCantSeat(entry.id)}
                    onDelete={() => deleteMutation.mutate(entry.id)}
                    isDeleting={deleteMutation.isPending}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Entries with no preferred slot */}
          {noTimeEntries.length > 0 && (
            <div className="space-y-1">
              {hasSlots && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">No specific slot</span>
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs text-muted-foreground shrink-0">{noTimeEntries.length} waiting</span>
                </div>
              )}
              <div className="rounded-xl border overflow-hidden divide-y">
                {noTimeEntries.map((entry, idx) => (
                  <WaitlistRow
                    key={entry.id}
                    entry={entry}
                    idx={idx}
                    onSeat={() => setSeatEntry(entry)}
                    onCantSeat={() => handleCantSeat(entry.id)}
                    onDelete={() => deleteMutation.mutate(entry.id)}
                    isDeleting={deleteMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* History */}
        {done.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">History ({done.length})</h2>
            <div className="rounded-xl border overflow-hidden divide-y">
              {done.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3 opacity-60"
                  data-testid={`row-done-${entry.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{entry.guestName}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />{entry.partySize}
                      </span>
                      {entry.preferredTime && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />{entry.preferredTime}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig[entry.status as WaitlistStatus]?.className ?? ""}`}>
                      {statusConfig[entry.status as WaitlistStatus]?.label ?? entry.status}
                    </span>
                    <button
                      onClick={() => deleteMutation.mutate(entry.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`btn-delete-done-${entry.id}`}
                      className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-500 text-muted-foreground transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {seatEntry && (
        <SeatModal
          entry={seatEntry}
          onClose={() => setSeatEntry(null)}
          onSeated={handleSeated}
        />
      )}
    </div>
  );
}
