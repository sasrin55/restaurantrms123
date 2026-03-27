import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { format } from "date-fns";
import { Users, Clock, Phone, Plus, X, CheckCheck, Armchair } from "lucide-react";
import type { Reservation } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────
type WaitlistStatus = "waiting" | "notified" | "seated" | "cancelled";

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
  notifyError?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function uuid() {
  return crypto.randomUUID();
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

function formatEstRemaining(entry: WaitlistEntry): string {
  const waited = elapsedMins(entry.joinedAt);
  const rem = entry.estimatedWaitMins - waited;
  if (rem <= 0) return "Ready";
  return `${rem} min`;
}

const statusConfig: Record<WaitlistStatus, { label: string; className: string }> = {
  waiting:   { label: "Waiting",   className: "bg-amber-100 text-amber-800 border-amber-200" },
  notified:  { label: "Notified",  className: "bg-blue-100 text-blue-800 border-blue-200" },
  seated:    { label: "Seated",    className: "bg-[#4A5D23] text-white border-transparent" },
  cancelled: { label: "Left",      className: "bg-rose-100 text-rose-700 border-rose-200" },
};

// ── Ticker hook ────────────────────────────────────────────────────────────
function useTick(intervalMs = 1000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

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

  const { data: allReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const todaySeatedTableIds = new Set(
    allReservations
      .filter(r => r.date === todayStr && r.status === "seated")
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
    const now = format(new Date(), "h:mm a");

    try {
      await createReservation.mutateAsync({
        customerName: entry.guestName,
        phoneNumber: entry.phone || "0",
        date: todayStr,
        time: now,
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
            Party of {entry.partySize} — select an available table
          </p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto py-1">
          {restaurantTables.map(table => {
            const occupied = todaySeatedTableIds.has(table.id);
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

// ── Main page ──────────────────────────────────────────────────────────────
export default function WaitlistPage() {
  const { toast } = useToast();
  const tick = useTick(30000);
  void tick;

  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [seatEntry, setSeatEntry] = useState<WaitlistEntry | null>(null);

  // Form state
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState("");
  const [estWait, setEstWait] = useState("20");
  const [notes, setNotes] = useState("");

  // Notify mutation
  const notifyMutation = useMutation({
    mutationFn: ({ entryId, guestName: name, phone: p }: { entryId: string; guestName: string; phone: string }) =>
      apiRequest("POST", "/api/waitlist/notify", { guestName: name, phone: p }),
    onSuccess: (_data, vars) => {
      setWaitlist(prev => prev.map(e =>
        e.id === vars.entryId
          ? { ...e, notified: true, notifiedAt: Date.now(), status: "notified", notifyError: undefined }
          : e
      ));
      toast({ title: "WhatsApp message sent" });
    },
    onError: (err: any, vars) => {
      const msg = err?.message || "Failed to send notification";
      setWaitlist(prev => prev.map(e =>
        e.id === vars.entryId ? { ...e, notifyError: msg } : e
      ));
      toast({ title: "Notification failed", description: msg, variant: "destructive" });
    },
  });

  function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim() || !partySize) return;
    const entry: WaitlistEntry = {
      id: uuid(),
      guestName: guestName.trim(),
      phone: phone.trim(),
      partySize: parseInt(partySize),
      notes: notes.trim(),
      joinedAt: Date.now(),
      estimatedWaitMins: parseInt(estWait) || 20,
      notified: false,
      notifiedAt: null,
      status: "waiting",
    };
    setWaitlist(prev => [...prev, entry]);
    setGuestName(""); setPhone(""); setPartySize(""); setEstWait("20"); setNotes("");
    toast({ title: `${entry.guestName} added to waitlist` });
  }

  function handleRemove(id: string) {
    setWaitlist(prev => prev.map(e => e.id === id ? { ...e, status: "cancelled" } : e));
  }

  function handleSeated(entryId: string) {
    setWaitlist(prev => prev.map(e => e.id === entryId ? { ...e, status: "seated" } : e));
  }

  const active = waitlist.filter(e => e.status !== "cancelled" && e.status !== "seated");
  const done   = waitlist.filter(e => e.status === "cancelled" || e.status === "seated");

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-lg sm:text-2xl font-semibold text-foreground" data-testid="text-waitlist-title">
            Waitlist
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage walk-in guests waiting for a table
          </p>
        </div>

        {/* Add guest form */}
        <div className="bg-card border rounded-xl p-4 sm:p-5 space-y-4">
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
                  placeholder="+923001234567"
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
                <Label className="text-xs">Est. Wait (mins)</Label>
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={estWait}
                  onChange={e => setEstWait(e.target.value)}
                  data-testid="input-est-wait"
                />
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Dietary requirements, preferences…"
                  data-testid="input-notes"
                />
              </div>
              <Button
                type="submit"
                className="bg-[#0D7377] text-white hover:bg-[#0a5f63] shrink-0"
                data-testid="btn-add-waitlist"
              >
                Add to Waitlist
              </Button>
            </div>
          </form>
        </div>

        {/* Live waitlist */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Waiting ({active.length})
            </h2>
            {active.length === 0 && (
              <span className="text-xs text-muted-foreground">— no guests waiting</span>
            )}
          </div>

          {active.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[2rem_1fr_5rem_6rem_6rem_7rem_10rem] gap-3 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <span>#</span>
                <span>Guest</span>
                <span>Party</span>
                <span>Waited</span>
                <span>Est. Rem.</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>

              {active.map((entry, idx) => {
                const isNotifying = notifyMutation.isPending && notifyMutation.variables?.entryId === entry.id;
                const rem = formatEstRemaining(entry);

                return (
                  <div
                    key={entry.id}
                    className="border-t first:border-t-0 px-4 py-3 sm:grid sm:grid-cols-[2rem_1fr_5rem_6rem_6rem_7rem_10rem] gap-3 items-center hover:bg-muted/20 transition-colors"
                    data-testid={`row-waitlist-${entry.id}`}
                  >
                    {/* Position */}
                    <span className="hidden sm:block text-sm font-semibold text-muted-foreground">{idx + 1}</span>

                    {/* Name + phone + notes */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{entry.guestName}</p>
                      {entry.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />{entry.phone}
                        </p>
                      )}
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground italic truncate mt-0.5">{entry.notes}</p>
                      )}
                      {entry.notifyError && (
                        <p className="text-xs text-rose-500 mt-0.5">{entry.notifyError}</p>
                      )}
                    </div>

                    {/* Party */}
                    <div className="hidden sm:flex items-center gap-1 text-sm text-foreground">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {entry.partySize}
                    </div>

                    {/* Waited */}
                    <div className="hidden sm:flex items-center gap-1 text-sm text-foreground">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatElapsed(entry.joinedAt)}
                    </div>

                    {/* Est remaining */}
                    <div className={`hidden sm:block text-sm font-medium ${rem === "Ready" ? "text-green-600" : "text-foreground"}`}>
                      {rem}
                    </div>

                    {/* Status badge */}
                    <div className="hidden sm:block">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig[entry.status].className}`}>
                        {statusConfig[entry.status].label}
                      </span>
                      {entry.notifiedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(entry.notifiedAt, "h:mm a")}
                        </p>
                      )}
                    </div>

                    {/* Mobile summary row */}
                    <div className="sm:hidden flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{entry.partySize}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatElapsed(entry.joinedAt)}</span>
                      <span className={`font-medium ${rem === "Ready" ? "text-green-600" : ""}`}>{rem} left</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig[entry.status].className}`}>
                        {statusConfig[entry.status].label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1 mt-2 sm:mt-0">
                      {/* Notify */}
                      {!entry.notified ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isNotifying || !entry.phone}
                          title={!entry.phone ? "No phone number" : "Send WhatsApp notification"}
                          onClick={() => notifyMutation.mutate({ entryId: entry.id, guestName: entry.guestName, phone: entry.phone })}
                          className="text-xs h-7 px-2"
                          data-testid={`btn-notify-${entry.id}`}
                        >
                          {isNotifying ? "…" : "Notify"}
                        </Button>
                      ) : (
                        <span className="text-xs text-blue-600 flex items-center gap-1 px-1">
                          <CheckCheck className="h-3.5 w-3.5" /> Notified
                        </span>
                      )}

                      {/* Seat */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSeatEntry(entry)}
                        className="text-xs h-7 px-2 text-[#4A5D23] border-[#4A5D23]/30 hover:bg-[#4A5D23]/10"
                        data-testid={`btn-seat-${entry.id}`}
                      >
                        <Armchair className="h-3.5 w-3.5 mr-1" /> Seat
                      </Button>

                      {/* Remove */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemove(entry.id)}
                        className="text-xs h-7 w-7 p-0 text-muted-foreground hover:text-rose-500"
                        data-testid={`btn-remove-${entry.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Done section */}
        {done.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Completed / Left ({done.length})</h2>
            <div className="rounded-xl border overflow-hidden opacity-60">
              {done.map(entry => (
                <div
                  key={entry.id}
                  className="border-t first:border-t-0 px-4 py-2.5 flex items-center gap-3"
                  data-testid={`row-done-${entry.id}`}
                >
                  <span className="text-sm text-foreground font-medium truncate flex-1">{entry.guestName}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />{entry.partySize}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig[entry.status].className}`}>
                    {statusConfig[entry.status].label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Seat modal */}
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
