import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ReservationCard, ReservationRow, type ReservationStatus } from "@/components/reservation-card";
import { EditReservationDialog } from "@/components/edit-reservation-dialog";
import { Plus, Search, Calendar, LayoutGrid, List, Loader2, Upload, Users, Clock, Phone, Table2, XCircle, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, startOfWeek, endOfWeek, isWithinInterval, parseISO, isToday, isTomorrow } from "date-fns";
import type { Reservation } from "@shared/schema";
import { getTimeSlotsForDate, getPeriodLabel, ALL_SLOTS, type MealPeriod } from "@/lib/timeSlots";

type DateFilter = "today" | "tomorrow" | "this-week" | "custom";

interface GroupedReservation {
  ids: string[];
  reservations: Reservation[];
  customerName: string;
  status: string;
  time: string;
  partySize: number;
  tableNames: string[];
  phoneNumber: string;
  comments: string;
  date: string;
  takenBy: string;
}

function parseTimeTo24(time: string): number {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return 12;
  let hour = parseInt(match[1]);
  const minute = parseInt(match[2] || "0");
  const ampm = (match[3] || "").toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return hour + minute / 60;
}

function getTimePeriod(time: string, date: Date): MealPeriod {
  const slots = getTimeSlotsForDate(date);
  const slot = slots.find(s => s.label === time);
  if (slot) return slot.period;
  const fallback = ALL_SLOTS.find(s => s.label === time);
  if (fallback) return fallback.period;
  const h24 = parseTimeTo24(time);
  if (h24 < 10.5) return "breakfast";
  if (h24 < 12.5) return "brunch";
  if (h24 < 17) return "lunch";
  if (h24 < 19) return "tea";
  return "dinner";
}

function groupReservations(reservations: Reservation[]): GroupedReservation[] {
  const groups = new Map<string, Reservation[]>();

  for (const r of reservations) {
    // If the reservation has a groupId, always group by it (handles multi-table walk-ins)
    if ((r as any).groupId) {
      const key = `group:${(r as any).groupId}`;
      const existing = groups.get(key);
      if (existing) { existing.push(r); } else { groups.set(key, [r]); }
      continue;
    }
    const phone = (r.phoneNumber || "").trim().toLowerCase();
    const isAnonymous = !phone || phone === "n/a" || phone === "na" || phone === "any";
    // Anonymous / walk-in guests without a groupId are always separate cards
    const key = isAnonymous
      ? r.id
      : `${r.customerName}|${r.date}|${r.time}|${r.phoneNumber}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(key, [r]);
    }
  }

  return Array.from(groups.values()).map((group) => {
    const first = group[0];
    return {
      ids: group.map((r) => r.id),
      reservations: group,
      customerName: first.customerName,
      status: first.status,
      time: first.time,
      partySize: first.partySize,
      tableNames: [...new Set(group.map((r) => r.tableName.replace("Table ", "")))],
      phoneNumber: first.phoneNumber,
      comments: first.comments || "",
      date: first.date,
      takenBy: (first as any).takenBy || "",
    };
  });
}

export default function ReservationsPage() {
  const { toast } = useToast();
  const urlSearch = useSearch();
  const [, navigate] = useLocation();

  const subTab = (new URLSearchParams(urlSearch).get("view") ?? "active") as "active" | "completed" | "cancellations";
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [partySizeFilter, setPartySizeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [editingGroupReservations, setEditingGroupReservations] = useState<Reservation[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const p = new URLSearchParams(urlSearch);
    return p.get("date") ? "custom" : "today";
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const p = new URLSearchParams(urlSearch);
    const d = p.get("date");
    return d ? new Date(d + "T12:00:00") : new Date();
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Cancellations tab own date filter
  const [cancelDateMode, setCancelDateMode] = useState<"today" | "date" | "range" | "all">("today");
  const [cancelDate, setCancelDate] = useState<Date | undefined>(undefined);
  const [cancelRangeFrom, setCancelRangeFrom] = useState<Date | undefined>(undefined);
  const [cancelRangeTo, setCancelRangeTo] = useState<Date | undefined>(undefined);
  const [cancelDateOpen, setCancelDateOpen] = useState(false);
  const [cancelRangeOpen, setCancelRangeOpen] = useState(false);

  const [slotFilter, setSlotFilter] = useState<"all" | string>(() => {
    const p = new URLSearchParams(urlSearch);
    return p.get("slot") || "all";
  });

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/reservations/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
    },
  });

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<GroupedReservation | null>(null);

  const deleteReservationMutation = useMutation({
    mutationFn: async (id: string) => {
      setDeletingIds(prev => new Set(prev).add(id));
      return apiRequest("DELETE", `/api/reservations/${id}`);
    },
    onSuccess: (_data, id) => {
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      toast({ title: "Reservation removed" });
    },
    onError: (_err, id) => {
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      toast({ title: "Could not remove reservation", description: "It may have already been deleted.", variant: "destructive" });
    },
  });

  const exportToSheetsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/reservations/export-sheets");
    },
    onSuccess: () => {
      toast({ title: "Exported to Google Sheets", description: "All reservations have been pushed to the spreadsheet." });
    },
    onError: (error: Error) => {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    },
  });


  const handleEdit = (reservation: Reservation, groupResv?: Reservation[]) => {
    setEditingReservation(reservation);
    setEditingGroupReservations(groupResv || [reservation]);
    setEditDialogOpen(true);
  };

  const executeGroupDelete = (group: GroupedReservation) => {
    for (const id of group.ids) {
      deleteReservationMutation.mutate(id);
    }
  };

  const handleGroupPrimaryAction = (group: GroupedReservation) => {
    const status = group.status;
    if (status === "complete" || status === "no-show") {
      setPendingDeleteGroup(group);
      return;
    }
    for (const id of group.ids) {
      switch (status) {
        case "booked":
          updateStatusMutation.mutate({ id, status: "confirmed" });
          break;
        case "seated":
          updateStatusMutation.mutate({ id, status: "complete" });
          break;
        case "confirmed":
          updateStatusMutation.mutate({ id, status: "seated" });
          break;
        case "cancelled":
          updateStatusMutation.mutate({ id, status: "booked" });
          break;
      }
    }
  };

  const handleGroupTertiaryAction = (group: GroupedReservation) => {
    if (group.status === "seated") {
      for (const id of group.ids) {
        updateStatusMutation.mutate({ id, status: "confirmed" });
      }
    }
  };

  const handleGroupSecondaryAction = (group: GroupedReservation) => {
    if (group.status === "cancelled") {
      setPendingDeleteGroup(group);
    } else if (group.status === "complete") {
      for (const id of group.ids) {
        updateStatusMutation.mutate({ id, status: "seated" });
      }
    } else {
      for (const id of group.ids) {
        updateStatusMutation.mutate({ id, status: "cancelled" });
      }
    }
  };

  const handleDateFilterChange = (filter: DateFilter) => {
    setDateFilter(filter);
    setSlotFilter("all");
    if (filter === "today") {
      setSelectedDate(new Date());
    } else if (filter === "tomorrow") {
      setSelectedDate(addDays(new Date(), 1));
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setSlotFilter("all");
      if (isToday(date)) {
        setDateFilter("today");
      } else if (isTomorrow(date)) {
        setDateFilter("tomorrow");
      } else {
        setDateFilter("custom");
      }
      setCalendarOpen(false);
    }
  };

  const getDateDisplayLabel = () => {
    if (dateFilter === "today") return "Today";
    if (dateFilter === "tomorrow") return "Tomorrow";
    if (dateFilter === "this-week") return "This Week";
    return format(selectedDate, "MMM d, yyyy");
  };

  const matchesDateFilter = (reservationDate: string) => {
    try {
      const resDate = parseISO(reservationDate);
      
      if (dateFilter === "this-week") {
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
        return isWithinInterval(resDate, { start: weekStart, end: weekEnd });
      }
      
      const targetDate = format(selectedDate, "yyyy-MM-dd");
      return reservationDate === targetDate;
    } catch {
      return true;
    }
  };

  const ACTIVE_STATUSES = ["booked", "confirmed", "seated"];
  const COMPLETED_STATUSES = ["complete"];
  const CANCELLED_STATUSES = ["cancelled", "no-show"];

  const subTabStatuses = subTab === "active"
    ? ACTIVE_STATUSES
    : subTab === "completed"
    ? COMPLETED_STATUSES
    : CANCELLED_STATUSES;

  const filteredReservations = reservations.filter((reservation) => {
    const matchesSearch =
      reservation.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reservation.phoneNumber.includes(searchQuery) ||
      reservation.tableName.includes(searchQuery);

    const matchesStatus =
      statusFilter === "all" || reservation.status === statusFilter;

    const matchesPartySize =
      partySizeFilter === "all" ||
      (partySizeFilter === "1-2" && reservation.partySize <= 2) ||
      (partySizeFilter === "3-4" && reservation.partySize >= 3 && reservation.partySize <= 4) ||
      (partySizeFilter === "5-6" && reservation.partySize >= 5 && reservation.partySize <= 6) ||
      (partySizeFilter === "7+" && reservation.partySize >= 7);

    const matchesDate = subTab === "cancellations"
      ? (() => {
          if (cancelDateMode === "all") return true;
          if (cancelDateMode === "today") return reservation.date === format(new Date(), "yyyy-MM-dd");
          if (cancelDateMode === "date" && cancelDate) return reservation.date === format(cancelDate, "yyyy-MM-dd");
          if (cancelDateMode === "range" && cancelRangeFrom) {
            const fromStr = format(cancelRangeFrom, "yyyy-MM-dd");
            const toStr   = cancelRangeTo ? format(cancelRangeTo, "yyyy-MM-dd") : fromStr;
            return reservation.date >= fromStr && reservation.date <= toStr;
          }
          return true;
        })()
      : matchesDateFilter(reservation.date);
    const matchesSubTab = subTabStatuses.includes(reservation.status);

    return matchesSearch && matchesStatus && matchesPartySize && matchesDate && matchesSubTab;
  });

  const groupedReservations = groupReservations(filteredReservations).sort((a, b) => {
    const timeDiff = parseTimeTo24(a.time) - parseTimeTo24(b.time);
    if (timeDiff !== 0) return timeDiff;
    return a.customerName.localeCompare(b.customerName);
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6 border-b pb-4 sm:pb-6">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-semibold text-foreground mb-0.5 sm:mb-1" data-testid="text-page-title">
              {subTab === "completed" ? "Completed Reservations" : subTab === "cancellations" ? "Cancellations & No-Shows" : "Reservations"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block" data-testid="text-page-subtitle">Manage and view all of your reservations.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => exportToSheetsMutation.mutate()}
              disabled={exportToSheetsMutation.isPending}
              title="Export to Google Sheets"
              data-testid="button-export-sheets"
            >
              {exportToSheetsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
            </Button>
            <Link href="/new-reservation">
              <Button 
                className="bg-[#0D7377] hover:bg-[#0a5c5f] text-white gap-2 rounded-full px-3 sm:px-5"
                data-testid="button-new-reservation"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New Reservation</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 flex-wrap">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or table"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background"
              data-testid="input-search"
            />
          </div>

          {subTab === "cancellations" ? (
            <div className="flex items-center gap-1.5 flex-wrap" data-testid="cancel-date-filter">
              {/* Today */}
              <button
                onClick={() => setCancelDateMode("today")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${cancelDateMode === "today" ? "bg-[#0D7377] text-white border-[#0D7377]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}
                data-testid="button-cancel-filter-today"
              >
                Today
              </button>

              {/* Specific date */}
              <Popover open={cancelDateOpen} onOpenChange={setCancelDateOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${cancelDateMode === "date" ? "bg-[#0D7377] text-white border-[#0D7377]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}
                    data-testid="button-cancel-filter-date"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {cancelDateMode === "date" && cancelDate ? format(cancelDate, "MMM d") : "Date"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={cancelDate}
                    onSelect={(d) => { setCancelDate(d); setCancelDateMode("date"); setCancelDateOpen(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Date range */}
              <Popover open={cancelRangeOpen} onOpenChange={setCancelRangeOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${cancelDateMode === "range" ? "bg-[#0D7377] text-white border-[#0D7377]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}
                    data-testid="button-cancel-filter-range"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {cancelDateMode === "range" && cancelRangeFrom
                      ? `${format(cancelRangeFrom, "MMM d")}${cancelRangeTo ? ` – ${format(cancelRangeTo, "MMM d")}` : " – …"}`
                      : "Range"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="range"
                    selected={{ from: cancelRangeFrom, to: cancelRangeTo }}
                    onSelect={(r) => {
                      setCancelRangeFrom(r?.from);
                      setCancelRangeTo(r?.to);
                      setCancelDateMode("range");
                      if (r?.from && r?.to) setCancelRangeOpen(false);
                    }}
                    numberOfMonths={2}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* All time */}
              <button
                onClick={() => setCancelDateMode("all")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${cancelDateMode === "all" ? "bg-[#0D7377] text-white border-[#0D7377]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}
                data-testid="button-cancel-filter-all"
              >
                All time
              </button>

              {/* Clear back to today */}
              {cancelDateMode !== "today" && (
                <button
                  onClick={() => { setCancelDateMode("today"); setCancelDate(undefined); setCancelRangeFrom(undefined); setCancelRangeTo(undefined); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  data-testid="button-cancel-filter-clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="gap-2 min-w-[100px] justify-between" 
                  data-testid="button-date-picker"
                >
                  <span>{getDateDisplayLabel()}</span>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-2 border-b flex gap-1">
                  <Button
                    variant={dateFilter === "today" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      handleDateFilterChange("today");
                      setCalendarOpen(false);
                    }}
                    data-testid="button-filter-today"
                  >
                    Today
                  </Button>
                  <Button
                    variant={dateFilter === "tomorrow" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      handleDateFilterChange("tomorrow");
                      setCalendarOpen(false);
                    }}
                    data-testid="button-filter-tomorrow"
                  >
                    Tomorrow
                  </Button>
                  <Button
                    variant={dateFilter === "this-week" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setDateFilter("this-week");
                      setCalendarOpen(false);
                    }}
                    data-testid="button-filter-this-week"
                  >
                    This Week
                  </Button>
                </div>
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleCalendarSelect}
                  initialFocus
                  />
                </PopoverContent>
              </Popover>
          )}

          {subTab === "active" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] sm:w-[140px]" data-testid="select-status">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="seated">Seated</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Select value={partySizeFilter} onValueChange={setPartySizeFilter}>
            <SelectTrigger className="w-[120px] sm:w-[150px]" data-testid="select-party-size">
              <SelectValue placeholder="All Party Sizes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Party Sizes</SelectItem>
              <SelectItem value="1-2">1-2 people</SelectItem>
              <SelectItem value="3-4">3-4 people</SelectItem>
              <SelectItem value="5-6">5-6 people</SelectItem>
              <SelectItem value="7+">7+ people</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-none rounded-l-md"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-none rounded-r-md"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {subTab === "active" && (
          <div className="flex items-center gap-2 mb-4 sm:mb-6 overflow-x-auto pb-1" data-testid="slot-tabs">
            {getTimeSlotsForDate(selectedDate)
              .filter(slot => groupedReservations.some(g => g.time === slot.label))
              .map(slot => {
                const count = groupedReservations.filter(g => g.time === slot.label).length;
                const isActive = slotFilter === slot.label;
                return (
                  <button
                    key={slot.label}
                    onClick={() => setSlotFilter(isActive ? "all" : slot.label)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      isActive ? "bg-[#0D7377] text-white" : "bg-muted text-muted-foreground hover-elevate"
                    }`}
                    data-testid={`button-slot-${slot.label}`}
                  >
                    {getPeriodLabel(slot.period)} · {slot.label} ({count})
                  </button>
                );
              })}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : groupedReservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              {subTab === "completed" ? (
                <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
              ) : subTab === "cancellations" ? (
                <XCircle className="h-8 w-8 text-muted-foreground" />
              ) : (
                <Calendar className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2" data-testid="text-empty-title">
              {subTab === "completed"
                ? `No completed reservations ${dateFilter === "today" ? "today" : dateFilter === "tomorrow" ? "tomorrow" : dateFilter === "this-week" ? "this week" : `on ${format(selectedDate, "MMM d")}`}`
                : subTab === "cancellations"
                ? cancelDateMode === "all"
                  ? "No cancellations or no-shows on record"
                  : cancelDateMode === "today"
                  ? "No cancellations or no-shows today"
                  : cancelDateMode === "date" && cancelDate
                  ? `No cancellations or no-shows on ${format(cancelDate, "MMM d")}`
                  : cancelDateMode === "range" && cancelRangeFrom
                  ? `No cancellations or no-shows in this range`
                  : "No cancellations or no-shows"
                : `No reservations ${dateFilter === "today" ? "for today" : dateFilter === "tomorrow" ? "for tomorrow" : dateFilter === "this-week" ? "this week" : `for ${format(selectedDate, "MMM d")}`}`}
            </h3>
            {subTab === "active" && (
              <>
                <p className="text-muted-foreground mb-4 max-w-sm" data-testid="text-empty-description">
                  Start by creating a reservation or try a different date filter.
                </p>
                <Link href="/new-reservation">
                  <Button
                    className="bg-[#0D7377] text-white gap-2"
                    data-testid="button-create-first-reservation"
                  >
                    <Plus className="h-4 w-4" />
                    Create Reservation
                  </Button>
                </Link>
              </>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="space-y-8">
            {Array.from(new Set(
              (slotFilter === "all" ? groupedReservations : groupedReservations.filter(g => g.time === slotFilter))
                .map(g => g.time)
            ))
              .sort((a, b) => parseTimeTo24(a) - parseTimeTo24(b))
              .map(time => {
                const slotGroups = groupedReservations.filter(g =>
                  (slotFilter === "all" || g.time === slotFilter) && g.time === time
                );
                if (slotGroups.length === 0) return null;
                const period = getTimePeriod(time, selectedDate);
                return (
                  <div key={time}>
                    <h2 className="text-lg font-semibold text-foreground mb-4" data-testid={`text-slot-${time}`}>
                      {getPeriodLabel(period)} · {time}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                      {slotGroups.map((group) => (
                        <ReservationCard
                          key={group.ids[0]}
                          id={group.ids[0]}
                          guestName={group.customerName}
                          status={group.status as ReservationStatus}
                          time={group.time}
                          partySize={group.partySize}
                          tableNumber={group.tableNames.join(" + ")}
                          phone={group.phoneNumber}
                          comments={group.comments}
                          takenBy={group.takenBy}
                          disabled={group.ids.some(id => deletingIds.has(id))}
                          onEdit={() => handleEdit(group.reservations[0], group.reservations)}
                          onPrimaryAction={() => handleGroupPrimaryAction(group)}
                          onSecondaryAction={() => handleGroupSecondaryAction(group)}
                          onTertiaryAction={() => handleGroupTertiaryAction(group)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="space-y-8">
            {Array.from(new Set(
              (slotFilter === "all" ? groupedReservations : groupedReservations.filter(g => g.time === slotFilter))
                .map(g => g.time)
            ))
              .sort((a, b) => parseTimeTo24(a) - parseTimeTo24(b))
              .map(time => {
                const slotGroups = groupedReservations.filter(g =>
                  (slotFilter === "all" || g.time === slotFilter) && g.time === time
                );
                if (slotGroups.length === 0) return null;
                const period = getTimePeriod(time, selectedDate);
                return (
                  <div key={time}>
                    <h2 className="text-lg font-semibold text-foreground mb-4" data-testid={`text-slot-list-${time}`}>
                      {getPeriodLabel(period)} · {time}
                    </h2>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="text-left py-3 px-3 font-medium text-muted-foreground whitespace-nowrap text-sm">Name</th>
                            <th className="text-left py-3 px-3 font-medium text-muted-foreground whitespace-nowrap text-sm">Time</th>
                            <th className="text-left py-3 px-3 font-medium text-muted-foreground whitespace-nowrap text-sm">Pax</th>
                            <th className="text-left py-3 px-3 font-medium text-muted-foreground whitespace-nowrap text-sm">Table</th>
                            <th className="text-left py-3 px-3 font-medium text-muted-foreground whitespace-nowrap text-sm">Phone</th>
                            <th className="text-left py-3 px-3 font-medium text-muted-foreground whitespace-nowrap text-sm">Server</th>
                            <th className="text-left py-3 px-3 font-medium text-muted-foreground whitespace-nowrap text-sm">Status</th>
                            <th className="text-left py-3 px-3 font-medium text-muted-foreground whitespace-nowrap text-sm">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slotGroups.map((group) => (
                            <ReservationRow
                              key={group.ids[0]}
                              id={group.ids[0]}
                              guestName={group.customerName}
                              status={group.status as ReservationStatus}
                              time={group.time}
                              partySize={group.partySize}
                              tableNumber={group.tableNames.join(" + ")}
                              phone={group.phoneNumber}
                              comments={group.comments}
                              takenBy={group.takenBy}
                              disabled={group.ids.some(id => deletingIds.has(id))}
                              onEdit={() => handleEdit(group.reservations[0], group.reservations)}
                              onPrimaryAction={() => handleGroupPrimaryAction(group)}
                              onSecondaryAction={() => handleGroupSecondaryAction(group)}
                              onTertiaryAction={() => handleGroupTertiaryAction(group)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <EditReservationDialog
        reservation={editingReservation}
        groupReservations={editingGroupReservations}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      <AlertDialog
        open={!!pendingDeleteGroup}
        onOpenChange={(open) => { if (!open) setPendingDeleteGroup(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this reservation?</AlertDialogTitle>
            <AlertDialogDescription>
              This reservation and all associated customer data will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">
              No, go back
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-delete-confirm"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => {
                if (pendingDeleteGroup) {
                  executeGroupDelete(pendingDeleteGroup);
                  setPendingDeleteGroup(null);
                }
              }}
            >
              Yes, remove it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
