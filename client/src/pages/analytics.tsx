import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Reservation } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Check, ChevronDown } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  amber:  "#EF9F27",
  blue:   "#378ADD",
  purple: "#7F77DD",
  teal:   "#1D9E75",
  gray:   "#888780",
  muted:  "#c8c6be",
};

// ── Date helpers ───────────────────────────────────────────────────────────
const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_NAMES: Record<string, string> = {
  "01":"January","02":"February","03":"March","04":"April",
  "05":"May","06":"June","07":"July","08":"August",
  "09":"September","10":"October","11":"November","12":"December",
};

function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

function getDayOfWeek(dateStr: string): string {
  return DAYS[parseDate(dateStr).dow];
}

function getShortDate(dateStr: string): string {
  const { d, m } = parseDate(dateStr);
  return `${d} ${MONTHS[m - 1]}`;
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "2026-03"
}

function getMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[m] ?? m} ${y}`;
}

function getWeekLabel(dateStr: string): string {
  const { d } = parseDate(dateStr);
  if (d <= 7)  return "Wk 1 (1–7)";
  if (d <= 14) return "Wk 2 (8–14)";
  if (d <= 21) return "Wk 3 (15–21)";
  return "Wk 4 (22+)";
}

function getTimeSlot(time: string): string {
  if (time.includes("5:00"))  return "5:00 PM";
  if (time.includes("8:00"))  return "8:00 PM";
  if (time.includes("10:00")) return "10:00 PM";
  if (time.includes("12:00") || time.includes("2:00 AM")) return "Late / Sehri";
  return time || "Other";
}

function slotColor(slot: string): string {
  if (slot.includes("5:00"))  return C.amber;
  if (slot.includes("8:00"))  return C.blue;
  if (slot.includes("10:00")) return C.purple;
  return C.gray;
}

function dowColor(dow: string): string {
  if (dow === "Sunday")   return C.blue;
  if (dow === "Saturday") return C.teal;
  if (dow === "Friday")   return C.amber;
  return C.muted;
}

// ── Analytics engine ───────────────────────────────────────────────────────
function computeAnalytics(reservations: Reservation[]) {
  const active = reservations.filter(r => r.status !== "cancelled");

  const totalCovers = active.reduce((s, r) => s + r.partySize, 0);
  const totalResos  = active.length;
  const avgParty    = totalResos ? +(totalCovers / totalResos).toFixed(1) : 0;

  // By day
  const dayMap: Record<string, { covers: number; resos: number; tables: Set<string>; dow: string }> = {};
  for (const r of active) {
    if (!dayMap[r.date]) dayMap[r.date] = { covers: 0, resos: 0, tables: new Set(), dow: getDayOfWeek(r.date) };
    dayMap[r.date].covers += r.partySize;
    dayMap[r.date].resos  += 1;
    if (r.tableName) dayMap[r.date].tables.add(r.tableName);
  }
  const dayData = Object.entries(dayMap)
    .map(([date, v]) => ({
      date,
      shortDate: getShortDate(date),
      dow: v.dow,
      covers: v.covers,
      resos: v.resos,
      tablesUsed: v.tables.size,
      utilPct: Math.round(v.tables.size / 17 * 100),
      dayNum: parseDate(date).d,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const activeDays = dayData.length;
  const avgPerDay  = activeDays ? Math.round(totalCovers / activeDays) : 0;

  // By slot
  const slotMap: Record<string, { covers: number; resos: number }> = {};
  for (const r of active) {
    const slot = getTimeSlot(r.time);
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

  // By day of week
  const dowMap: Record<string, { covers: number; resos: number; days: Set<string> }> = {};
  for (const r of active) {
    const dow = getDayOfWeek(r.date);
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

  // Weekly buckets
  const weekMap: Record<string, number> = {
    "Wk 1 (1–7)": 0, "Wk 2 (8–14)": 0, "Wk 3 (15–21)": 0, "Wk 4 (22+)": 0,
  };
  for (const r of active) {
    const wk = getWeekLabel(r.date);
    weekMap[wk] = (weekMap[wk] ?? 0) + r.partySize;
  }
  const weekData = Object.entries(weekMap)
    .map(([week, covers]) => ({ week, covers }))
    .filter(w => w.covers > 0);

  // Repeat guests (by phone)
  const guestMap: Record<string, { displayName: string; visits: number; covers: number }> = {};
  for (const r of active) {
    const phone = r.phoneNumber.replace(/\s+/g, "").replace(/^0+/, "");
    if (!phone || phone === "N/A" || phone === "0") continue;
    if (!guestMap[phone]) guestMap[phone] = { displayName: r.customerName, visits: 0, covers: 0 };
    guestMap[phone].visits += 1;
    guestMap[phone].covers += r.partySize;
  }
  const repeatGuests = Object.values(guestMap)
    .filter(g => g.visits > 1 && !g.displayName.toLowerCase().includes("walk"))
    .sort((a, b) => b.visits - a.visits);
  const repeatResos = repeatGuests.reduce((s, g) => s + g.visits, 0);
  const repeatRate  = totalResos ? Math.round(repeatResos / totalResos * 100) : 0;

  // Table performance
  const tableMap: Record<string, { bookings: number; covers: number }> = {};
  for (const r of active) {
    const t = r.tableName;
    if (!t) continue;
    if (!tableMap[t]) tableMap[t] = { bookings: 0, covers: 0 };
    tableMap[t].bookings += 1;
    tableMap[t].covers   += r.partySize;
  }
  const tableData = Object.entries(tableMap)
    .map(([table, v]) => ({ table, ...v }))
    .sort((a, b) => b.bookings - a.bookings);

  const avgUtilPct = dayData.length
    ? Math.round(dayData.reduce((s, d) => s + d.utilPct, 0) / dayData.length)
    : 0;

  const busiestDay  = [...dayData].sort((a, b) => b.covers - a.covers)[0];
  const busiestDow  = dowData[0];
  const busiestSlot = slotData[0];

  // Status counts (all reservations, not just active)
  const statusCounts: Partial<Record<KnownStatus, number>> = {};
  for (const r of reservations) {
    const s = r.status as KnownStatus;
    if (s in STATUS_CONFIG) statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  return {
    totalCovers, totalResos: reservations.length, avgParty, avgPerDay, activeDays,
    dayData, slotData, dowData, weekData,
    busiestDay, busiestDow, busiestSlot,
    repeatGuests, repeatRate,
    tableData, avgUtilPct,
    statusCounts,
  };
}

// ── Status filter card ─────────────────────────────────────────────────────
const STATUS_CONFIG = {
  confirmed: { label: "Confirmed", color: "#16a34a" },
  seated:    { label: "Seated",    color: "#4A5D23" },
  complete:  { label: "Completed", color: "#2563eb" },
} as const;

type KnownStatus = keyof typeof STATUS_CONFIG;
type FilterOption = "total" | KnownStatus;

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: "total",     label: "Total" },
  { value: "confirmed", label: "Confirmed" },
  { value: "seated",    label: "Seated" },
  { value: "complete",  label: "Completed" },
];

function ReservationStatusCard({
  total, counts, accent,
}: {
  total: number;
  counts: Partial<Record<KnownStatus, number>>;
  accent?: string;
}) {
  const [filter, setFilter] = useState<FilterOption>("total");
  const displayed = filter === "total" ? total : (counts[filter] ?? 0);
  const activeOption = FILTER_OPTIONS.find(o => o.value === filter)!;
  const color = filter !== "total" ? STATUS_CONFIG[filter as KnownStatus].color : undefined;

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

// ── UI primitives ──────────────────────────────────────────────────────────
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

function PlaceholderCard({ label, note }: { label: string; note: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-200">—</p>
      <p className="text-xs text-gray-300 mt-1 leading-snug">{note}</p>
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

// ── Main page ──────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { data: allReservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    staleTime: 60 * 1000,
  });

  // Auto-detect months and default to most recent
  const availableMonths = useMemo(() => {
    const keys = [...new Set(allReservations.map(r => getMonthKey(r.date)))].sort().reverse();
    return keys;
  }, [allReservations]);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const activeMonth = selectedMonth ?? availableMonths[0] ?? null;

  const filtered = useMemo(() =>
    activeMonth ? allReservations.filter(r => r.date.startsWith(activeMonth)) : [],
    [allReservations, activeMonth]
  );

  const stats = useMemo(() => computeAnalytics(filtered), [filtered]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div>
  );

  if (!allReservations.length) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">No reservation data found.</div>
  );

  const {
    totalCovers, totalResos, avgParty, avgPerDay, activeDays,
    dayData, slotData, dowData, weekData,
    busiestDay, busiestDow, busiestSlot,
    repeatGuests, repeatRate,
    tableData, avgUtilPct, statusCounts,
  } = stats;

  const maxDowCovers     = Math.max(1, ...dowData.map(d => d.covers));
  const maxTableBookings = tableData[0]?.bookings ?? 1;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-10 font-sans overflow-auto">

      {/* Header + month selector */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" data-testid="text-analytics-title">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeMonth ? getMonthLabel(activeMonth) : "—"} · {activeDays} active days · from database
          </p>
        </div>
        {availableMonths.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors">
                {activeMonth ? getMonthLabel(activeMonth) : "Select month"}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {availableMonths.map(m => (
                <DropdownMenuItem key={m} onClick={() => setSelectedMonth(m)}
                  className="flex items-center justify-between cursor-pointer">
                  <span>{getMonthLabel(m)}</span>
                  {activeMonth === m && <Check className="h-3.5 w-3.5 ml-3 text-gray-500" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── PERFORMANCE ── */}
      <div>
        <SectionHeader label="Performance" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard value={totalCovers} label="Total covers"     sub="guests served"                         accent={C.teal}   />
          <ReservationStatusCard total={totalResos} counts={statusCounts} accent={C.blue} />
          <KpiCard value={avgParty}    label="Avg party size"   sub="guests per booking"                    accent={C.amber}  />
          <KpiCard value={avgPerDay}   label="Avg covers / day" sub={`based on ${activeDays} active days`}  accent={C.purple} />
        </div>
      </div>

      {/* ── DEMAND PATTERNS ── */}
      <div>
        <SectionHeader label="Demand Patterns" />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Busiest day</p>
            <p className="text-xl font-semibold text-gray-900">{busiestDay?.shortDate ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-1">{busiestDay?.covers} covers · {busiestDay?.resos} reservations</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Busiest day of week</p>
            <p className="text-xl font-semibold text-gray-900">{busiestDow?.dow ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-1">
              avg {busiestDow?.avgPerDay} covers/day · {busiestDow?.days} {busiestDow?.dow}s
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-gray-400 mb-1">Busiest slot</p>
            <p className="text-xl font-semibold text-gray-900">{busiestSlot?.slot ?? "—"}</p>
            <p className="text-xs text-gray-400 mt-1">
              {busiestSlot?.pct}% of covers · {busiestSlot?.covers} guests
            </p>
          </div>
        </div>

        <ChartCard title="Covers by day" className="mb-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dayData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0ede8" />
              <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="covers" name="Covers" radius={[4, 4, 0, 0]}>
                {dayData.map((entry, i) => <Cell key={i} fill={dowColor(entry.dow)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3 justify-end flex-wrap">
            {([["Sunday", C.blue], ["Saturday", C.teal], ["Friday", C.amber], ["Weekday", C.muted]] as [string,string][]).map(([l, c]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                <span className="text-xs text-gray-400">{l}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <ChartCard title="By service slot">
            {slotData.map(s => (
              <HorizBar key={s.slot} label={s.slot} value={s.covers}
                maxValue={slotData[0]?.covers ?? 1} color={s.color} suffix=" covers" />
            ))}
            <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
              {slotData.map(s => (
                <div key={s.slot} className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">{s.slot}</span>
                  <span className="text-xs font-semibold" style={{ color: s.color }}>{s.pct}%</span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="By day of week">
            {dowData.map(d => (
              <HorizBar key={d.dow} label={d.dow} value={d.covers}
                maxValue={maxDowCovers} color={C.teal} suffix=" covers" />
            ))}
          </ChartCard>
        </div>

        <ChartCard title="Weekly trend">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weekData} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0ede8" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="covers" name="Covers"
                stroke={C.teal} strokeWidth={2.5} dot={{ fill: C.teal, r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── GUEST BEHAVIOR ── */}
      <div>
        <SectionHeader label="Guest Behavior" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <KpiCard value={`${repeatRate}%`} label="Repeat guest rate"
            sub="of bookings from returning guests" accent={C.teal} />
          <KpiCard value={repeatGuests.length} label="Returning guests"
            sub="visited more than once" accent={C.blue} />
          <PlaceholderCard label="Cancellation rate" note="Includes cancelled reservations" />
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Top returning guests</p>
          {repeatGuests.length === 0 ? (
            <p className="text-sm text-gray-300">No repeat guests this month.</p>
          ) : (
            <div>
              {repeatGuests.slice(0, 8).map((g, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                      style={{ background: C.teal + "22", color: C.teal }}>
                      {g.displayName[0]?.toUpperCase()}
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
      </div>

      {/* ── OPERATIONS ── */}
      <div>
        <SectionHeader label="Operations" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiCard value={`${avgUtilPct}%`} label="Avg table utilisation"
            sub="booked tables vs 17 available" accent={C.blue} />
          <KpiCard
            value={tableData[0]?.table ?? "—"}
            label="Most booked table"
            sub={tableData[0] ? `${tableData[0].bookings} bookings` : ""}
            accent={C.teal} />
          <KpiCard
            value={tableData[tableData.length - 1]?.table ?? "—"}
            label="Least booked table"
            sub={tableData[tableData.length - 1] ? `${tableData[tableData.length - 1].bookings} bookings` : ""}
            accent={C.muted} />
          <PlaceholderCard label="Avg table turnover" note="Requires end-time data" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChartCard title="Table utilisation by day">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dayData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f0ede8" />
                <XAxis dataKey="shortDate" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} formatter={(v: any) => [`${v}%`, "Utilisation"]} />
                <Bar dataKey="utilPct" name="Utilisation %" radius={[3, 3, 0, 0]} fill={C.blue + "66"} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Table performance">
            {tableData.slice(0, 10).map((t, i) => (
              <HorizBar key={t.table} label={t.table} value={t.bookings}
                maxValue={maxTableBookings} color={i < 3 ? C.teal : C.gray} suffix=" bookings" />
            ))}
          </ChartCard>
        </div>
      </div>

    </div>
  );
}
