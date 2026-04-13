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
import { Users, Clock, Phone, Plus, X, Check, Trash2, Calendar, ChevronDown, Archive } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const reservationDate = entry.preferredDate || format(new Date(), "yyyy-MM-dd");
  const reservationTime = entry.preferredTime || format(new Date(), "h:mm a");

  const { data: allReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const occupiedTableIds = new Set(
    allReservations
      .filter(r => {
        if (r.date !== reservationDate) return false;
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
        date: reservationDate,
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
            {entry.preferredDate && entry.preferredDate !== format(new Date(), "yyyy-MM-dd") && (
              <> · <span className="font-medium">{format(new Date(entry.preferredDate + "T00:00:00"), "EEE d MMM")}</span></>
            )}
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
  const [preferredDate, setPreferredDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [viewDate, setViewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [archivingDate, setArchivingDate] = useState<string | null>(null);
  const [pastExpanded, setPastExpanded] = useState(false);

  const formDate = preferredDate ? new Date(preferredDate + "T00:00:00") : new Date();
  const formSlots = getTimeSlotsForDate(formDate);

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

  const archiveMutation = useMutation({
    mutationFn: (date: string) => apiRequest("DELETE", `/api/waitlist/archive/${date}`),
    onSuccess: (_data, date) => {
      queryClient.invalidateQueries({ queryKey: ["/api/waitlist"] });
      setArchiveConfirm(false);
      toast({ title: `History for ${format(new Date(date + "T00:00:00"), "EEE d MMM")} archived` });
    },
    onError: () => toast({ title: "Failed to archive history", variant: "destructive" }),
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
      preferredDate: preferredDate || format(new Date(), "yyyy-MM-dd"),
    }, {
      onSuccess: () => {
        setGuestName(""); setPhone(""); setPartySize(""); setNotes(""); setPreferredTime("");
        setPreferredDate(format(new Date(), "yyyy-MM-dd"));
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

  const todayStr    = format(new Date(), "yyyy-MM-dd");
  const tomorrowStr = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");

  function dayLabel(d: string) {
    if (d === todayStr) return "Today";
    if (d === tomorrowStr) return "Tomorrow";
    return format(new Date(d + "T00:00:00"), "EEE d MMM");
  }

  // Always show today + next 6 days as tabs, plus any further future dates that have entries
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStr + "T00:00:00");
    d.setDate(d.getDate() + i);
    return format(d, "yyyy-MM-dd");
  });
  const presentFutureDates = [...new Set([
    ...next7Days,
    ...waitlist.map(e => e.preferredDate || todayStr).filter(d => d >= todayStr),
  ])].sort();

  // Past dates that have done entries
  const pastDates = [...new Set(
    done.map(e => e.preferredDate || todayStr).filter(d => d < todayStr)
  )].sort().reverse(); // newest first

  // If viewDate got stale (from a previous session), clamp to a valid tab
  const safeViewDate = presentFutureDates.includes(viewDate) ? viewDate : todayStr;

  // Entries for the selected day tab
  const activeForView = active.filter(e => (e.preferredDate || todayStr) === safeViewDate);
  const doneForView   = done.filter(e => (e.preferredDate || todayStr) === safeViewDate);

  // Build slot groups for the selected day
  const viewDateObj = new Date(safeViewDate + "T00:00:00");
  const viewSlots   = getTimeSlotsForDate(viewDateObj);

  type SlotGroup = { slotLabel: string; period: string; entries: WaitlistEntry[] };
  const slotGroups: SlotGroup[] = viewSlots
    .map(slot => ({
      slotLabel: slot.label,
      period: getPeriodLabel(slot.period),
      entries: activeForView.filter(e => e.preferredTime === slot.label),
    }))
    .filter(g => g.entries.length > 0);

  const noSlotEntries = activeForView.filter(e => !viewSlots.some(s => s.label === e.preferredTime));

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
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
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal text-left"
                      data-testid="input-preferred-date"
                    >
                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {preferredDate
                          ? format(new Date(preferredDate + "T00:00:00"), "EEE d MMM")
                          : "Pick a date"}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={preferredDate ? new Date(preferredDate + "T00:00:00") : undefined}
                      onSelect={day => {
                        if (day) {
                          setPreferredDate(format(day, "yyyy-MM-dd"));
                          setPreferredTime("");
                        }
                      }}
                      disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="col-span-2 sm:col-span-2 space-y-1">
                <Label className="text-xs">Time Slot</Label>
                <Select value={preferredTime || "any"} onValueChange={v => setPreferredTime(v === "any" ? "" : v)}>
                  <SelectTrigger data-testid="select-preferred-time">
                    <SelectValue placeholder="Any slot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any slot</SelectItem>
                    {formSlots.map(slot => (
                      <SelectItem key={slot.label} value={slot.label}>
                        {getPeriodLabel(slot.period)} · {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 sm:col-span-2 space-y-1">
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

        {/* ── Day tabs ── */}
        <div className="flex items-center gap-1 border-b overflow-x-auto pb-0 scrollbar-none">
          {presentFutureDates.map(d => {
            const totalForDay = waitlist.filter(e => (e.preferredDate || todayStr) === d).length;
            const activeForDay = active.filter(e => (e.preferredDate || todayStr) === d).length;
            const isSelected = d === safeViewDate;
            return (
              <button
                key={d}
                onClick={() => setViewDate(d)}
                data-testid={`tab-day-${d}`}
                className={[
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0",
                  isSelected
                    ? "border-[#0D7377] text-[#0D7377]"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {dayLabel(d)}
                {totalForDay > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    isSelected ? "bg-[#0D7377]/10 text-[#0D7377]" : "bg-muted text-muted-foreground"
                  }`}>
                    {activeForDay > 0 ? activeForDay : totalForDay}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Active entries for selected day ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Waiting
              {activeForView.length > 0
                ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">({activeForView.length} guest{activeForView.length !== 1 ? "s" : ""})</span>
                : <span className="ml-1.5 text-xs font-normal text-muted-foreground">— no one waiting</span>
              }
            </h2>
          </div>

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

          {noSlotEntries.length > 0 && (
            <div className="space-y-1">
              {slotGroups.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">No specific slot</span>
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs text-muted-foreground shrink-0">{noSlotEntries.length} waiting</span>
                </div>
              )}
              <div className="rounded-xl border overflow-hidden divide-y">
                {noSlotEntries.map((entry, idx) => (
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

        {/* ── Seated / done entries for selected day ── */}
        {doneForView.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed today</h2>
              <div className="h-px bg-border flex-1" />
            </div>
            <div className="rounded-xl border overflow-hidden divide-y opacity-70">
              {doneForView.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3"
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

        {/* ── Previous Days ── */}
        {pastDates.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setPastExpanded(o => !o)}
              className="flex items-center gap-2 w-full text-left"
              data-testid="btn-toggle-past"
            >
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Previous Days</span>
              <div className="h-px bg-border flex-1" />
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${pastExpanded ? "" : "-rotate-90"}`} />
            </button>

            {pastExpanded && pastDates.map(d => {
              const pastDone = done.filter(e => (e.preferredDate || todayStr) === d);
              if (pastDone.length === 0) return null;
              return (
                <div key={d} className="space-y-2 pl-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">{dayLabel(d)}</span>
                    <div className="h-px bg-border flex-1" />
                    <button
                      onClick={() => setArchivingDate(d)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-rose-500 transition-colors px-1.5 py-0.5 rounded hover:bg-rose-50"
                      data-testid={`btn-archive-${d}`}
                    >
                      <Archive className="h-3 w-3" />
                      Archive
                    </button>
                  </div>
                  <div className="rounded-xl border overflow-hidden divide-y opacity-60">
                    {pastDone.map(entry => (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{entry.guestName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig[entry.status as WaitlistStatus]?.className ?? ""}`}>
                            {statusConfig[entry.status as WaitlistStatus]?.label ?? entry.status}
                          </span>
                          <button
                            onClick={() => deleteMutation.mutate(entry.id)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-500 text-muted-foreground transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Archive confirmation dialog */}
        {archivingDate && (
          <Dialog open onOpenChange={() => setArchivingDate(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Archive {dayLabel(archivingDate)}?</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  This permanently removes completed and cancelled entries for this day. <strong>Active (waiting) guests are never affected.</strong> This cannot be undone.
                </p>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setArchivingDate(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  disabled={archiveMutation.isPending}
                  onClick={() => archiveMutation.mutate(archivingDate)}
                  data-testid="btn-confirm-archive"
                >
                  {archiveMutation.isPending ? "Archiving…" : "Archive"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
