import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Reservation } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { MoreHorizontal, Check, CalendarIcon, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { restaurantTables } from "@/lib/tables";

// ── Palette ─────────────────────────────────────────────────────────────────
const C = {
  amber:  "#EF9F27",
  blue:   "#378ADD",
  purple: "#7F77DD",
  teal:   "#1D9E75",
  gray:   "#888780",
  muted:  "#c8c6be",
};

function slotColor(slot = "") {
  if (slot.toLowerCase().includes("iftar") || slot.includes("5:00")) return C.amber;
  if (slot.includes("8:00"))  return C.blue;
  if (slot.includes("10:00")) return C.purple;
  if (slot.toLowerCase().includes("sehri") || slot.includes("12:00 AM") || slot.includes("2:00 AM")) return C.purple;
  if (slot.includes("12:00 PM") || slot.includes("1:00") || slot.includes("2:00 PM")) return C.teal;
  return C.gray;
}

function dayColor(dow = "") {
  if (dow === "Sunday")   return C.blue;
  if (dow === "Saturday") return C.teal;
  if (dow === "Friday")   return C.amber;
  return C.muted;
}

// ── Walk-in detector ─────────────────────────────────────────────────────────
function isWalkIn(r: Reservation) {
  return (r.comments ?? "").toLowerCase().startsWith("walk-in");
}

// ── Shared UI ───────────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest whitespace-nowrap">{label}</h2>
      <div className="h-px bg-gray-100 flex-1" />
    </div>
  );
}

function KpiCard({ value, label, sub, accent }: { value: string | number; label: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 relative overflow-hidden">
      {accent && <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ background: accent }} />}
      <p className="text-xs text-gray-400 mb-1 pl-1">{label}</p>
      <p className="text-3xl font-semibold text-gray-900 leading-none pl-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1 pl-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-4 ${className}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

function HorizBar({ label, value, maxValue, color, suffix = "" }: { label: string; value: number; maxValue: number; color: string; suffix?: string }) {
  const pct = maxValue ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-xs text-gray-500 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
        <div className="h-full rounded flex items-center px-2 transition-all duration-500"
          style={{ width: `${Math.max(pct, 3)}%`, background: color + "33" }}>
          {pct > 28 && <span className="text-xs font-medium" style={{ color }}>{value}{suffix}</span>}
        </div>
      </div>
      <span className="text-xs text-gray-400 w-16 text-right shrink-0">{value}{suffix}</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.fill }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

// ── Status card (DB) ────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  booked:    { label: "Booked",    color: "#3b82f6" },
  confirmed: { label: "Confirmed", color: "#16a34a" },
  seated:    { label: "Seated",    color: "#4A5D23" },
  complete:  { label: "Completed", color: "#2563eb" },
} as const;
type KnownStatus = keyof typeof STATUS_CONFIG;
type FilterOption = "total" | KnownStatus;
const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: "total",     label: "Total" },
  { value: "booked",    label: "Booked" },
  { value: "confirmed", label: "Confirmed" },
  { value: "seated",    label: "Seated" },
  { value: "complete",  label: "Completed" },
];

function ReservationStatusCard({ total, counts, accent }: { total: number; counts: Partial<Record<KnownStatus, number>>; accent?: string }) {
  const [filter, setFilter] = useState<FilterOption>("total");
  const displayed = filter === "total" ? total : (counts[filter] ?? 0);
  const activeOption = FILTER_OPTIONS.find(o => o.value === filter)!;
  const color = filter !== "total" ? STATUS_CONFIG[filter].color : undefined;

  return (
    <div className="bg-gray-50 rounded-xl p-4 relative overflow-hidden">
      {accent && <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ background: accent }} />}
      <div className="flex items-start justify-between pl-1">
        <p className="text-xs text-gray-400">Reservations</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors -mt-0.5 -mr-0.5">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {FILTER_OPTIONS.map(opt => (
              <DropdownMenuItem key={opt.value} onClick={() => setFilter(opt.value)}
                className="flex items-center justify-between cursor-pointer">
                <span className="text-sm">{opt.label}</span>
                {filter === opt.value && <Check className="h-3.5 w-3.5 text-gray-500" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-3xl font-semibold leading-none pl-1 mt-1" style={{ color: color ?? "#111827" }}>
        {displayed}
      </p>
      <p className="text-xs text-gray-400 mt-1 pl-1">{activeOption.label}</p>
    </div>
  );
}

// ── DB analytics ─────────────────────────────────────────────────────────────
function computeDbAnalytics(reservations: Reservation[]) {
  const active   = reservations.filter(r => r.status !== "cancelled" && r.status !== "no-show");
  const walkIns  = active.filter(r => isWalkIn(r));
  const booked   = active.filter(r => !isWalkIn(r));

  const totalCovers = active.reduce((s, r) => s + r.partySize, 0);
  const totalResos  = active.length;
  const avgParty    = totalResos ? +(totalCovers / totalResos).toFixed(1) : 0;

  const dayMap: Record<string, { covers: number; resos: number; tables: Set<number>; dow: string }> = {};
  for (const r of active) {
    if (!dayMap[r.date]) {
      let dow = "";
      try { dow = format(parseISO(r.date), "EEEE"); } catch {}
      dayMap[r.date] = { covers: 0, resos: 0, tables: new Set(), dow };
    }
    dayMap[r.date].covers += r.partySize;
    dayMap[r.date].resos  += 1;
    dayMap[r.date].tables.add(r.tableId);
  }
  const dayData = Object.entries(dayMap)
    .map(([date, v]) => ({
      date,
      label: (() => { try { return format(parseISO(date), "MMM d"); } catch { return date; } })(),
      covers: v.covers, resos: v.resos,
      tablesUsed: v.tables.size,
      utilPct: Math.round(v.tables.size / restaurantTables.length * 100),
      dow: v.dow,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const activeDays = dayData.length;
  const avgPerDay  = activeDays ? Math.round(totalCovers / activeDays) : 0;

  const slotMap: Record<string, { covers: number; resos: number }> = {};
  for (const r of active) {
    const slot = r.time;
    if (!slotMap[slot]) slotMap[slot] = { covers: 0, resos: 0 };
    slotMap[slot].covers += r.partySize;
    slotMap[slot].resos  += 1;
  }
  const slotData = Object.entries(slotMap)
    .map(([slot, v]) => ({
      slot, ...v,
      color: slotColor(slot),
      pct: totalCovers ? Math.round(v.covers / totalCovers * 100) : 0,
    }))
    .sort((a, b) => b.covers - a.covers);

  const dowMap: Record<string, { covers: number; resos: number; days: Set<string> }> = {};
  for (const r of active) {
    let dow = "Unknown";
    try { dow = format(parseISO(r.date), "EEEE"); } catch {}
    if (!dowMap[dow]) dowMap[dow] = { covers: 0, resos: 0, days: new Set() };
    dowMap[dow].covers += r.partySize;
    dowMap[dow].resos  += 1;
    dowMap[dow].days.add(r.date);
  }
  const dowData = Object.entries(dowMap)
    .map(([dow, v]) => ({
      dow, covers: v.covers, resos: v.resos,
      days: v.days.size,
      avgPerDay: Math.round(v.covers / v.days.size),
    }))
    .sort((a, b) => b.covers - a.covers);

  const tableMap: Record<string, { bookings: number; covers: number }> = {};
  for (const r of active) {
    const key = r.tableName;
    if (!tableMap[key]) tableMap[key] = { bookings: 0, covers: 0 };
    tableMap[key].bookings += 1;
    tableMap[key].covers   += r.partySize;
  }
  const tableData = Object.entries(tableMap)
    .map(([table, v]) => ({ table, ...v }))
    .sort((a, b) => b.bookings - a.bookings);

  // Repeat guests: exclude walk-ins so "Walk-in" entries don't appear as one massive repeat guest
  const nameMap: Record<string, { displayName: string; visits: number; covers: number }> = {};
  for (const r of booked) {
    const key = (r.phoneNumber && r.phoneNumber !== "0" ? r.phoneNumber : r.customerName).toLowerCase().trim();
    if (!nameMap[key]) nameMap[key] = { displayName: r.customerName, visits: 0, covers: 0 };
    nameMap[key].visits += 1;
    nameMap[key].covers += r.partySize;
  }
  const repeatGuests = Object.values(nameMap)
    .filter(g => g.visits > 1)
    .sort((a, b) => b.visits - a.visits);
  const repeatResos = repeatGuests.reduce((s, g) => s + g.visits, 0);
  const repeatRate  = booked.length ? Math.round(repeatResos / booked.length * 100) : 0;

  const statusCounts: Partial<Record<KnownStatus, number>> = {};
  for (const r of reservations) {
    const s = r.status as KnownStatus;
    if (s in STATUS_CONFIG) statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const noShowCount = reservations.filter(r => r.status === "no-show").length;
  const cancelCount = reservations.filter(r => r.status === "cancelled").length;
  const noShowRate  = reservations.length ? Math.round(noShowCount / reservations.length * 100) : 0;
  const cancelRate  = reservations.length ? Math.round(cancelCount / reservations.length * 100) : 0;
  const avgUtilPct  = dayData.length ? Math.round(dayData.reduce((s, d) => s + d.utilPct, 0) / dayData.length) : 0;
  const busiestDay  = [...dayData].sort((a, b) => b.covers - a.covers)[0];
  const busiestDow  = dowData[0];
  const busiestSlot = slotData[0];

  // Walk-in analytics
  const walkInCovers  = walkIns.reduce((s, r) => s + r.partySize, 0);
  const walkInPct     = totalResos ? Math.round(walkIns.length / totalResos * 100) : 0;
  const walkInAvgParty = walkIns.length ? +(walkInCovers / walkIns.length).toFixed(1) : 0;

  const wiSlotMap: Record<string, number> = {};
  for (const r of walkIns) {
    wiSlotMap[r.time] = (wiSlotMap[r.time] ?? 0) + 1;
  }
  const wiSlotData = Object.entries(wiSlotMap)
    .map(([slot, count]) => ({ slot, count, color: slotColor(slot) }))
    .sort((a, b) => b.count - a.count);

  const wiPeakSlot = wiSlotData[0];

  return {
    totalCovers, totalResos, avgParty, avgPerDay, activeDays,
    dayData, slotData, dowData, tableData,
    busiestDay, busiestDow, busiestSlot,
    repeatGuests, repeatRate,
    statusCounts, noShowCount, cancelCount, noShowRate, cancelRate,
    avgUtilPct,
    walkIns, walkInCovers, walkInPct, walkInAvgParty,
    wiSlotData, wiPeakSlot,
  };
}

function LiveAnalytics({ reservations }: { reservations: Reservation[] }) {
  const stats = useMemo(() => computeDbAnalytics(reservations), [reservations]);
  const {
    totalCovers, totalResos, avgParty, avgPerDay, activeDays,
    dayData, slotData, dowData, tableData,
    busiestDay, busiestDow, busiestSlot,
    repeatGuests, repeatRate,
    statusCounts, noShowCount, cancelCount, noShowRate, cancelRate,
    avgUtilPct,
    walkIns, walkInCovers, walkInPct, walkInAvgParty,
    wiSlotData, wiPeakSlot,
  } = stats;

  const maxDowCovers     = Math.max(...dowData.map(d => d.covers), 1);
  const maxTableBookings = tableData[0]?.bookings ?? 1;
  const isEmpty          = totalResos === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-700 mb-1">No data for this date</h3>
        <p className="text-sm text-gray-400 max-w-sm">
          Try selecting a different date or switch to all-time view.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Performance */}
      <div>
        <SectionHeader label="Performance" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard value={totalCovers} label="Total covers"     sub="guests served"                          accent={C.teal}   />
          <ReservationStatusCard total={totalResos} counts={statusCounts} accent={C.blue} />
          <KpiCard value={avgParty}   label="Avg party size"   sub="guests per booking"                     accent={C.amber}  />
          <KpiCard value={avgPerDay}  label="Avg covers / day" sub={`based on ${activeDays} active days`}   accent={C.purple} />
        </div>
      </div>

      {/* Demand Patterns */}
      <div>
        <SectionHeader label="Demand Patterns" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Busiest day</p>
            <p className="text-xl font-semibold text-gray-900">{busiestDay?.label ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-1">{busiestDay?.covers} covers · {busiestDay?.resos} reservations</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Busiest day of week</p>
            <p className="text-xl font-semibold text-gray-900">{busiestDow?.dow ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-1">avg {busiestDow?.avgPerDay} covers/day</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-gray-400 mb-1">Busiest slot</p>
            <p className="text-xl font-semibold text-gray-900">{busiestSlot?.slot ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-1">{busiestSlot?.pct}% of covers · {busiestSlot?.covers} guests</p>
          </div>
        </div>

        {dayData.length > 1 && (
          <ChartCard title="Covers by day" className="mb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dayData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f0ede8" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="covers" name="Covers" radius={[4, 4, 0, 0]}>
                  {dayData.map((entry, i) => <Cell key={i} fill={dayColor(entry.dow)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-3 justify-end flex-wrap">
              {([["Sunday", C.blue], ["Saturday", C.teal], ["Friday", C.amber], ["Weekday", C.muted]] as [string, string][]).map(([l, c]) => (
                <div key={l} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                  <span className="text-xs text-gray-400">{l}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        )}

        {slotData.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <ChartCard title="By service slot">
              {slotData.map(s => (
                <HorizBar key={s.slot} label={s.slot}
                  value={s.covers} maxValue={slotData[0]?.covers ?? 1}
                  color={s.color} suffix=" covers" />
              ))}
            </ChartCard>
            {dowData.length > 0 && (
              <ChartCard title="By day of week">
                {dowData.map(d => (
                  <HorizBar key={d.dow} label={d.dow}
                    value={d.covers} maxValue={maxDowCovers}
                    color={C.teal} suffix=" covers" />
                ))}
              </ChartCard>
            )}
          </div>
        )}
      </div>

      {/* Guest Behavior */}
      <div>
        <SectionHeader label="Guest Behavior" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <KpiCard value={`${repeatRate}%`} label="Repeat guest rate"
            sub="of bookings from returning guests" accent={C.teal} />
          <KpiCard value={`${cancelRate}%`} label="Cancellation rate"
            sub={`${cancelCount} cancelled`} accent={C.gray} />
          <KpiCard value={`${noShowRate}%`} label="No-show rate"
            sub={`${noShowCount} no-shows`} accent={C.amber} />
        </div>

        {repeatGuests.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Top returning guests</p>
            {repeatGuests.slice(0, 8).map((g, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                    style={{ background: C.teal + "22", color: C.teal }}>
                    {g.displayName[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-800">{g.displayName}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold text-gray-700">{g.visits} visits</span>
                  <span className="text-xs text-gray-300 ml-2">{g.covers} covers</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Walk-ins */}
      {walkIns.length > 0 && (
        <div>
          <SectionHeader label="Walk-ins" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiCard value={walkIns.length}    label="Walk-in visits"   sub="guests without a reservation" accent={C.amber} />
            <KpiCard value={walkInCovers}      label="Walk-in covers"   sub="total guests"                 accent={C.amber} />
            <KpiCard value={`${walkInPct}%`}   label="% of all visits"  sub="share of total bookings"      accent={C.gray}  />
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Peak walk-in slot</p>
              <p className="text-lg font-semibold text-gray-900 leading-tight">{wiPeakSlot?.slot ?? "—"}</p>
              <p className="text-xs text-gray-400 mt-1">{wiPeakSlot?.count ?? 0} walk-ins</p>
            </div>
          </div>

          {wiSlotData.length > 0 && (
            <ChartCard title="Walk-ins by time slot">
              {wiSlotData.map(s => (
                <HorizBar key={s.slot} label={s.slot}
                  value={s.count} maxValue={wiSlotData[0]?.count ?? 1}
                  color={s.color} suffix=" walk-ins" />
              ))}
            </ChartCard>
          )}
        </div>
      )}

      {/* Operations */}
      <div>
        <SectionHeader label="Operations" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiCard value={`${avgUtilPct}%`} label="Avg table utilisation"
            sub={`booked tables vs ${restaurantTables.length} available`} accent={C.blue} />
          <KpiCard
            value={tableData[0]?.table ?? "—"}
            label="Most used table"
            sub={`${tableData[0]?.bookings ?? 0} bookings`}
            accent={C.teal} />
          <KpiCard
            value={tableData[tableData.length - 1]?.table ?? "—"}
            label="Least used table"
            sub={`${tableData[tableData.length - 1]?.bookings ?? 0} bookings`}
            accent={C.gray} />
        </div>

        {tableData.length > 0 && (
          <ChartCard title="Table performance">
            {tableData.slice(0, 10).map((t, i) => (
              <HorizBar key={t.table} label={t.table}
                value={t.bookings} maxValue={maxTableBookings}
                color={i < 3 ? C.teal : C.gray} suffix=" bookings" />
            ))}
          </ChartCard>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { data: dbReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!selectedDate) return dbReservations;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    return dbReservations.filter(r => r.date === dateStr);
  }, [dbReservations, selectedDate]);

  const dateLabel = selectedDate ? format(selectedDate, "MMM d, yyyy") : null;

  return (
    <div className="p-6 max-w-6xl mx-auto font-sans overflow-auto" data-testid="text-analytics-title">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {dateLabel ? `Showing data for ${dateLabel}` : "Live data · all time"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* All data button */}
          <button
            onClick={() => setSelectedDate(undefined)}
            className={[
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
              !selectedDate
                ? "bg-[#0D7377] text-white border-[#0D7377]"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
            ].join(" ")}
            data-testid="button-analytics-all"
          >
            All time
          </button>

          {/* Date picker */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                className={[
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                  selectedDate
                    ? "bg-[#0D7377] text-white border-[#0D7377]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
                ].join(" ")}
                data-testid="button-analytics-date"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateLabel ?? "Pick a date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { setSelectedDate(d); setCalendarOpen(false); }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Clear date */}
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(undefined)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              data-testid="button-analytics-clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <LiveAnalytics reservations={filtered} />
    </div>
  );
}
