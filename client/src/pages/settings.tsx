import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatName } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, X, Plus, Pencil, Trash2, Check, Clock, ChevronUp, ChevronDown } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { getPeriodLabel, type MealPeriod } from "@/lib/timeSlots";
import type { Reservation, DbTimeSlot } from "@shared/schema";

// ── Reservation Log ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  booked: "bg-blue-500 text-white",
  confirmed: "bg-green-600 text-white",
  seated: "bg-[#4A5D23] text-white",
  complete: "bg-gray-500 text-white",
  cancelled: "bg-rose-500 text-white",
  "no-show": "bg-orange-500 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  seated: "Seated",
  complete: "Complete",
  cancelled: "Cancelled",
  "no-show": "No Show",
};

function formatCreatedAt(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "h:mm a")}`;
  return format(d, "EEE d MMM, h:mm a");
}

type DateRange = "today" | "7days" | "30days" | "all";

// ── Time Slots ────────────────────────────────────────────────────────────────

const PERIODS: MealPeriod[] = ["breakfast", "brunch", "lunch", "tea", "dinner"];

const PERIOD_COLORS: Record<MealPeriod, string> = {
  breakfast: "bg-amber-100 text-amber-800 border-amber-200",
  brunch:    "bg-orange-100 text-orange-800 border-orange-200",
  lunch:     "bg-green-100 text-green-800 border-green-200",
  tea:       "bg-teal-100 text-teal-800 border-teal-200",
  dinner:    "bg-indigo-100 text-indigo-800 border-indigo-200",
};

interface AddSlotFormProps {
  appliesTo: "weekday" | "weekend";
  existingCount: number;
  onSave: (label: string, period: MealPeriod) => void;
  onCancel: () => void;
  isPending: boolean;
}

function AddSlotForm({ onSave, onCancel, isPending }: AddSlotFormProps) {
  const [label, setLabel] = useState("");
  const [period, setPeriod] = useState<MealPeriod>("dinner");

  return (
    <div className="border border-dashed border-border rounded-lg p-3 bg-muted/30 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs mb-1 block">Time Range</Label>
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. 7:00 PM - 9:00 PM"
            className="h-8 text-sm"
            data-testid="input-new-slot-label"
            onKeyDown={e => e.key === "Enter" && label.trim() && onSave(label.trim(), period)}
            autoFocus
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Meal Period</Label>
          <Select value={period} onValueChange={v => setPeriod(v as MealPeriod)}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-new-slot-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => (
                <SelectItem key={p} value={p}>{getPeriodLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending} data-testid="button-cancel-new-slot">
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={() => label.trim() && onSave(label.trim(), period)} disabled={!label.trim() || isPending} data-testid="button-save-new-slot">
          <Check className="h-3.5 w-3.5 mr-1" /> Add Slot
        </Button>
      </div>
    </div>
  );
}

interface SlotRowProps {
  slot: DbTimeSlot;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: (id: number, label: string, period: MealPeriod) => void;
  onDelete: (slot: DbTimeSlot) => void;
}

function SlotRow({ slot, isFirst, isLast, onMoveUp, onMoveDown, onEdit, onDelete }: SlotRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(slot.label);
  const [draftPeriod, setDraftPeriod] = useState<MealPeriod>(slot.period as MealPeriod);

  const handleSave = () => {
    if (!draftLabel.trim()) return;
    onEdit(slot.id, draftLabel.trim(), draftPeriod);
    setEditing(false);
  };
  const handleCancel = () => {
    setDraftLabel(slot.label);
    setDraftPeriod(slot.period as MealPeriod);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border border-[#0D7377]/30 bg-[#0D7377]/5">
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          value={draftLabel}
          onChange={e => setDraftLabel(e.target.value)}
          className="h-7 text-sm flex-1"
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
          autoFocus
          data-testid={`input-edit-slot-${slot.id}`}
        />
        <Select value={draftPeriod} onValueChange={v => setDraftPeriod(v as MealPeriod)}>
          <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-edit-period-${slot.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map(p => (
              <SelectItem key={p} value={p}>{getPeriodLabel(p)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={handleSave}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={handleCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group" data-testid={`slot-row-${slot.id}`}>
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={onMoveUp} disabled={isFirst} className="h-4 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed" data-testid={`button-move-up-${slot.id}`}>
          <ChevronUp className="h-3 w-3" />
        </button>
        <button onClick={onMoveDown} disabled={isLast} className="h-4 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed" data-testid={`button-move-down-${slot.id}`}>
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium flex-1">{slot.label}</span>
      <Badge variant="outline" className={`text-xs font-normal shrink-0 ${PERIOD_COLORS[slot.period as MealPeriod] || ""}`}>
        {getPeriodLabel(slot.period as MealPeriod)}
      </Badge>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)} data-testid={`button-edit-slot-${slot.id}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(slot)} data-testid={`button-delete-slot-${slot.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { toast } = useToast();

  // — Reservation Log state —
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("7days");

  const { data: reservations = [], isLoading: resLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoffs: Record<DateRange, number> = {
      today: now - 24 * 60 * 60 * 1000,
      "7days": now - 7 * 24 * 60 * 60 * 1000,
      "30days": now - 30 * 24 * 60 * 60 * 1000,
      all: 0,
    };
    const cutoff = cutoffs[range];
    return reservations
      .filter(r => {
        const ts = r.createdAt ? new Date(r.createdAt).getTime() : 0;
        if (ts < cutoff) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return r.customerName.toLowerCase().includes(q) || r.phoneNumber.toLowerCase().includes(q) || r.tableName?.toLowerCase().includes(q) || r.takenBy?.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [reservations, search, range]);

  const rangeOptions: { label: string; value: DateRange }[] = [
    { label: "Today", value: "today" },
    { label: "Last 7 days", value: "7days" },
    { label: "Last 30 days", value: "30days" },
    { label: "All time", value: "all" },
  ];

  // — Time Slots state —
  const [slotsTab, setSlotsTab] = useState<"weekday" | "weekend">("weekday");
  const [addingSlot, setAddingSlot] = useState(false);
  const [deletingSlot, setDeletingSlot] = useState<DbTimeSlot | null>(null);

  const { data: slots = [], isLoading: slotsLoading } = useQuery<DbTimeSlot[]>({
    queryKey: ["/api/time-slots"],
  });

  const weekdaySlots = slots.filter(s => s.appliesTo === "weekday" && s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const weekendSlots = slots.filter(s => s.appliesTo === "weekend" && s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleSlots = slotsTab === "weekday" ? weekdaySlots : weekendSlots;

  const createMutation = useMutation({
    mutationFn: (data: { label: string; period: string; appliesTo: string; sortOrder: number }) =>
      apiRequest("POST", "/api/time-slots", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-slots"] });
      setAddingSlot(false);
      toast({ title: "Slot added" });
    },
    onError: () => toast({ title: "Failed to add slot", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; label?: string; period?: string; sortOrder?: number }) =>
      apiRequest("PATCH", `/api/time-slots/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/time-slots"] }),
    onError: () => toast({ title: "Failed to update slot", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/time-slots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-slots"] });
      setDeletingSlot(null);
      toast({ title: "Slot removed" });
    },
    onError: () => toast({ title: "Failed to delete slot", variant: "destructive" }),
  });

  const handleEdit = (id: number, label: string, period: MealPeriod) => updateMutation.mutate({ id, label, period });

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const curr = visibleSlots[index];
    const above = visibleSlots[index - 1];
    updateMutation.mutate({ id: curr.id, sortOrder: above.sortOrder });
    updateMutation.mutate({ id: above.id, sortOrder: curr.sortOrder });
  };

  const handleMoveDown = (index: number) => {
    if (index === visibleSlots.length - 1) return;
    const curr = visibleSlots[index];
    const below = visibleSlots[index + 1];
    updateMutation.mutate({ id: curr.id, sortOrder: below.sortOrder });
    updateMutation.mutate({ id: below.id, sortOrder: curr.sortOrder });
  };

  const handleAddSlot = (label: string, period: MealPeriod) => {
    createMutation.mutate({ label, period, appliesTo: slotsTab, sortOrder: visibleSlots.length });
  };

  return (
    <div className="p-6 sm:p-8 max-w-5xl space-y-12">

      {/* ── Time Slots section ── */}
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage restaurant configuration</p>
        </div>

        <h2 className="text-base font-semibold text-foreground mb-1">Time Slots</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Configure reservation slots for weekdays (Mon–Fri) and weekends (Sat–Sun).
          Changes appear immediately in the booking form and reservations page.
        </p>

        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-4">
          {(["weekday", "weekend"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setSlotsTab(tab); setAddingSlot(false); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${slotsTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-${tab}`}
            >
              {tab === "weekday" ? "Weekday (Mon–Fri)" : "Weekend (Sat–Sun)"}
            </button>
          ))}
        </div>

        <div className="border border-border rounded-xl bg-card overflow-hidden max-w-2xl">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              {visibleSlots.length} slot{visibleSlots.length !== 1 ? "s" : ""}
            </span>
            {!addingSlot && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setAddingSlot(true)} data-testid="button-add-slot">
                <Plus className="h-3.5 w-3.5" /> Add Slot
              </Button>
            )}
          </div>
          <div className="p-3 space-y-1">
            {slotsLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : visibleSlots.length === 0 && !addingSlot ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No slots yet. Add your first slot above.</div>
            ) : (
              visibleSlots.map((slot, index) => (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  isFirst={index === 0}
                  isLast={index === visibleSlots.length - 1}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  onEdit={handleEdit}
                  onDelete={setDeletingSlot}
                />
              ))
            )}
            {addingSlot && (
              <AddSlotForm
                appliesTo={slotsTab}
                existingCount={visibleSlots.length}
                onSave={handleAddSlot}
                onCancel={() => setAddingSlot(false)}
                isPending={createMutation.isPending}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Reservation Log section ── */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Reservation Log</h2>
        <p className="text-muted-foreground text-sm mb-4">
          A full history of every reservation and when it was taken.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, table, or server…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-log-search"
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {rangeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${range === opt.value ? "bg-[#0D7377] text-white border-[#0D7377]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}
                data-testid={`button-range-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {resLoading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">No reservations found for this period.</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 text-xs font-medium text-muted-foreground grid grid-cols-[1fr_1fr_80px_1fr_1fr_100px] gap-x-3 px-4 py-2.5 border-b">
              <span>Guest</span>
              <span>Reservation</span>
              <span>Pax</span>
              <span>Table</span>
              <span>Taken by</span>
              <span>Booked at</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.map(r => (
                <div
                  key={r.id}
                  className="grid grid-cols-[1fr_1fr_80px_1fr_1fr_100px] gap-x-3 items-center px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                  data-testid={`log-row-${r.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{formatName(r.customerName)}</p>
                    <p className="text-muted-foreground text-xs truncate">{r.phoneNumber}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground truncate">{r.date ? format(parseISO(r.date), "EEE d MMM") : "—"}</p>
                    <p className="text-muted-foreground text-xs truncate">{r.time}</p>
                  </div>
                  <div><span className="text-foreground">{r.partySize}</span></div>
                  <div className="text-muted-foreground truncate">{r.tableName}</div>
                  <div className="text-muted-foreground truncate">{r.takenBy || "—"}</div>
                  <div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${STATUS_COLORS[r.status] ?? "bg-gray-200 text-gray-700"}`} data-testid={`log-status-${r.id}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                    <p className="text-muted-foreground text-[11px] mt-0.5 whitespace-nowrap">{formatCreatedAt(r.createdAt as any)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 bg-muted/30 border-t text-xs text-muted-foreground">
              Showing {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </div>
          </div>
        )}
      </div>

      {/* ── Delete confirm dialog ── */}
      <AlertDialog open={!!deletingSlot} onOpenChange={open => !open && setDeletingSlot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this slot?</AlertDialogTitle>
            <AlertDialogDescription>
              "<strong>{deletingSlot?.label}</strong>" will be removed from the{" "}
              {deletingSlot?.appliesTo} schedule. Existing reservations are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingSlot && deleteMutation.mutate(deletingSlot.id)}
              data-testid="button-confirm-delete-slot"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
