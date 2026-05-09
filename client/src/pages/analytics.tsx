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
import { MoreHorizontal, Check, CalendarIcon, X, ChevronDown } from "lucide-react";
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
  const comments = (r.comments ?? "").toLowerCase();
  const name     = (r.customerName ?? "").toLowerCase().trim();
  const phone    = (r.phoneNumber ?? "").toLowerCase().trim();
  return (
    comments.startsWith("walk-in") ||
    name === "walk in" ||
    name === "walk-in" ||
    name === "walk-in guest" ||
    name === "walk in guest" ||
    name.startsWith("walk in") ||
    name.startsWith("walk-in") ||
    phone === "n/a" ||
    phone === "0"
  );
}

// ── Real-guest filter ─────────────────────────────────────────────────────────
// Exact placeholder names that should never appear in customer analytics
const PLACEHOLDER_NAMES = new Set([
  "hold", "block", "blocked", "closed", "open", "n/a", "na", "any",
  "annual day closed", "walk in", "walk-in", "walk in guest", "walk-in guest",
]);

function digitsOnly(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Returns true only for reservations that represent a real, identifiable guest */
function isRealGuest(r: Reservation): boolean {
  if (isWalkIn(r)) return false;
  const name = (r.customerName ?? "").toLowerCase().trim();
  // Reject exact placeholder names or names that start with placeholder words
  if (PLACEHOLDER_NAMES.has(name)) return false;
  if (/^(hold|block|closed)\b/.test(name)) return false;
  // Phone must have at least 10 digits after stripping non-numeric characters
  const digits = digitsOnly(r.phoneNumber ?? "");
  if (digits.length < 10) return false;
  // Reject all-zero phone numbers
  if (/^0+$/.test(digits)) return false;
  return true;
}

/** Stable key for deduplication: stripped digit string of the phone number */
function guestKey(r: Reservation): string {
  return digitsOnly(r.phoneNumber ?? "");
}

/** Format phone for display: keeps the raw value the staff entered */
function fmtPhone(phone: string): string {
  return (phone ?? "").trim();
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

  // Repeat guests: group strictly by phone number, filter out non-real guests
  const guestMap: Record<string, { displayName: string; phone: string; latestDate: string; visits: number; covers: number }> = {};
  for (const r of booked) {
    if (!isRealGuest(r)) continue;
    const key = guestKey(r);
    if (!guestMap[key]) {
      guestMap[key] = { displayName: r.customerName, phone: fmtPhone(r.phoneNumber ?? ""), latestDate: r.date, visits: 0, covers: 0 };
    } else if (r.date > guestMap[key].latestDate) {
      // Always show the most recently used name for this phone number
      guestMap[key].displayName = r.customerName;
      guestMap[key].phone       = fmtPhone(r.phoneNumber ?? "");
      guestMap[key].latestDate  = r.date;
    }
    guestMap[key].visits += 1;
    guestMap[key].covers += r.partySize;
  }
  const repeatGuests = Object.values(guestMap)
    .filter(g => g.visits > 1)
    .sort((a, b) => b.visits - a.visits);
  const repeatResos = repeatGuests.reduce((s, g) => s + g.visits, 0);
  // Repeat rate denominator: only real-guest bookings
  const realBookedCount = booked.filter(r => isRealGuest(r)).length;
  const repeatRate  = realBookedCount ? Math.round(repeatResos / realBookedCount * 100) : 0;

  const statusCounts: Partial<Record<KnownStatus, number>> = {};
  for (const r of reservations) {
    const s = r.status as KnownStatus;
    if (s in STATUS_CONFIG) statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const noShows     = reservations.filter(r => r.status === "no-show");
  const noShowCount = noShows.length;
  const cancelCount = reservations.filter(r => r.status === "cancelled").length;
  const noShowRate  = reservations.length ? Math.round(noShowCount / reservations.length * 100) : 0;
  const cancelRate  = reservations.length ? Math.round(cancelCount / reservations.length * 100) : 0;
  const avgUtilPct  = dayData.length ? Math.round(dayData.reduce((s, d) => s + d.utilPct, 0) / dayData.length) : 0;

  // No-show deep analytics
  const nsFromConfirmed = noShows.filter(r => r.previousStatus === "confirmed").length;
  const nsFromBooked    = noShows.filter(r => r.previousStatus === "booked").length;

  // No-show by time slot
  const nsSlotMap: Record<string, number> = {};
  for (const r of noShows) {
    nsSlotMap[r.time] = (nsSlotMap[r.time] ?? 0) + 1;
  }
  const nsSlotData = Object.entries(nsSlotMap)
    .map(([slot, count]) => ({ slot, count, color: slotColor(slot) }))
    .sort((a, b) => b.count - a.count);

  // Top no-show guests: group strictly by phone, filter out non-real guests
  const nsGuestMap: Record<string, { displayName: string; phone: string; latestDate: string; count: number; covers: number }> = {};
  for (const r of noShows) {
    if (!isRealGuest(r)) continue;
    const key = guestKey(r);
    if (!nsGuestMap[key]) {
      nsGuestMap[key] = { displayName: r.customerName, phone: fmtPhone(r.phoneNumber ?? ""), latestDate: r.date, count: 0, covers: 0 };
    } else if (r.date > nsGuestMap[key].latestDate) {
      nsGuestMap[key].displayName = r.customerName;
      nsGuestMap[key].phone       = fmtPhone(r.phoneNumber ?? "");
      nsGuestMap[key].latestDate  = r.date;
    }
    nsGuestMap[key].count  += 1;
    nsGuestMap[key].covers += r.partySize;
  }
  const nsTopGuests = Object.values(nsGuestMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
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
    noShows, nsFromConfirmed, nsFromBooked, nsSlotData, nsTopGuests,
  };
}

const VISIT_CAP = 30;

const VISIT_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  complete:  { label: "Completed", bg: "#dcfce7", text: "#15803d" },
  confirmed: { label: "Confirmed", bg: "#dbeafe", text: "#1d4ed8" },
  booked:    { label: "Booked",    bg: "#dbeafe", text: "#1d4ed8" },
  seated:    { label: "Seated",    bg: "#ecfccb", text: "#4A5D23" },
  "no-show": { label: "No-show",   bg: "#fff7ed", text: "#c2410c" },
  cancelled: { label: "Cancelled", bg: "#f3f4f6", text: "#6b7280" },
};

function VisitStatusChip({ status }: { status: string }) {
  const cfg = VISIT_STATUS[status] ?? VISIT_STATUS["booked"];
  return (
    <span className="inline-block text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  );
}

function LiveAnalytics({ reservations }: { reservations: Reservation[] }) {
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null);
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
    noShows, nsFromConfirmed, nsFromBooked, nsSlotData, nsTopGuests,
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
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 pt-4 pb-3">Top returning guests</p>
            {repeatGuests.slice(0, 8).map((g, i) => {
              const phoneDigits = digitsOnly(g.phone);
              const isOpen = expandedPhone === phoneDigits;
              const visits = reservations
                .filter(r => digitsOnly(r.phoneNumber ?? "") === phoneDigits)
                .sort((a, b) => {
                  const dc = b.date.localeCompare(a.date);
                  return dc !== 0 ? dc : b.time.localeCompare(a.time);
                });
              const shown = visits.slice(0, VISIT_CAP);
              const overflow = visits.length - VISIT_CAP;
              return (
                <div key={i} className="border-t border-gray-50 first:border-0">
                  {/* Guest row — clickable */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setExpandedPhone(isOpen ? null : phoneDigits)}
                    data-testid={`button-guest-expand-${i}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                        style={{ background: C.teal + "22", color: C.teal }}>
                        {g.displayName[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm text-gray-800 leading-tight">{g.displayName}</p>
                        <p className="text-xs text-gray-400 leading-tight">{g.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-semibold text-gray-700">{g.visits} visits</span>
                        <span className="text-xs text-gray-300 ml-2">{g.covers} covers</span>
                      </div>
                      <ChevronDown
                        className="h-4 w-4 text-gray-300 transition-transform duration-200 shrink-0"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      />
                    </div>
                  </button>

                  {/* Expanded visit history */}
                  {isOpen && (
                    <div className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                      {/* Desktop table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 border-b border-gray-200">
                              <th className="text-left font-medium pb-2 pr-3">Date</th>
                              <th className="text-left font-medium pb-2 pr-3">Time</th>
                              <th className="text-left font-medium pb-2 pr-3">Pax</th>
                              <th className="text-left font-medium pb-2 pr-3">Table</th>
                              <th className="text-left font-medium pb-2 pr-3">Status</th>
                              <th className="text-left font-medium pb-2 pr-3">Name used</th>
                              <th className="text-left font-medium pb-2">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shown.map((r) => {
                              const notes = (r.comments ?? "").trim();
                              let dateLabel = r.date;
                              try { dateLabel = format(parseISO(r.date), "EEE d MMM yyyy"); } catch {}
                              return (
                                <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                                  <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{dateLabel}</td>
                                  <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{r.time}</td>
                                  <td className="py-2 pr-3 text-gray-700">{r.partySize}</td>
                                  <td className="py-2 pr-3 text-gray-500">{r.tableName || "—"}</td>
                                  <td className="py-2 pr-3"><VisitStatusChip status={r.status} /></td>
                                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{r.customerName}</td>
                                  <td className="py-2 text-gray-400">
                                    {notes ? (
                                      <span title={notes} className="cursor-default">
                                        {notes.length > 40 ? notes.slice(0, 40) + "…" : notes}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile stacked cards */}
                      <div className="sm:hidden space-y-2">
                        {shown.map((r) => {
                          let dateLabel = r.date;
                          try { dateLabel = format(parseISO(r.date), "EEE d MMM yyyy"); } catch {}
                          return (
                            <div key={r.id} className="bg-white rounded-lg px-3 py-2.5 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-700">{dateLabel} · {r.time}</span>
                                <VisitStatusChip status={r.status} />
                              </div>
                              <div className="text-gray-500">{r.customerName} · {r.partySize} pax{r.tableName ? ` · ${r.tableName}` : ""}</div>
                              {r.comments && (
                                <div className="text-gray-400 truncate">{r.comments}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {overflow > 0 && (
                        <p className="text-xs text-gray-400 mt-3 text-center">
                          Showing {VISIT_CAP} of {visits.length} visits — switch to All Time to see more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* No-Shows */}
      {noShows.length > 0 && (
        <div>
          <SectionHeader label="No-Shows" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiCard value={noShowCount}        label="Total no-shows"    sub="guests who didn't arrive"          accent={C.amber} />
            <KpiCard value={`${noShowRate}%`}   label="No-show rate"      sub="of all reservations"               accent={C.amber} />
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Confirmed → no-show</p>
              <p className="text-2xl font-semibold text-gray-900">{nsFromConfirmed}</p>
              <p className="text-xs text-gray-400 mt-1">
                {`${noShowCount ? Math.round(nsFromConfirmed / noShowCount * 100) : 0}% of no-shows`}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Booked → no-show</p>
              <p className="text-2xl font-semibold text-gray-900">{nsFromBooked}</p>
              <p className="text-xs text-gray-400 mt-1">
                {`${noShowCount ? Math.round(nsFromBooked / noShowCount * 100) : 0}% of no-shows`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {nsSlotData.length > 0 && (
              <ChartCard title="No-shows by time slot">
                {nsSlotData.map(s => (
                  <HorizBar key={s.slot} label={s.slot}
                    value={s.count} maxValue={nsSlotData[0]?.count ?? 1}
                    color={C.amber} suffix=" no-shows" />
                ))}
              </ChartCard>
            )}

            {nsTopGuests.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Top no-show guests</p>
                {nsTopGuests.map((g, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                        style={{ background: C.amber + "22", color: C.amber }}>
                        {g.displayName[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm text-gray-800 leading-tight">{g.displayName}</p>
                        <p className="text-xs text-gray-400 leading-tight">{g.phone}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold text-gray-700">{g.count} {g.count === 1 ? "time" : "times"}</span>
                      <span className="text-xs text-gray-300 ml-2">{g.covers} covers</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
type FilterMode = "all" | "date" | "range";

export default function AnalyticsPage() {
  const { data: dbReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  const [mode, setMode]                   = useState<FilterMode>("all");
  const [selectedDate, setSelectedDate]   = useState<Date | undefined>(undefined);
  const [rangeFrom, setRangeFrom]         = useState<Date | undefined>(undefined);
  const [rangeTo, setRangeTo]             = useState<Date | undefined>(undefined);
  const [dateOpen, setDateOpen]           = useState(false);
  const [rangeOpen, setRangeOpen]         = useState(false);

  function clearAll() {
    setMode("all");
    setSelectedDate(undefined);
    setRangeFrom(undefined);
    setRangeTo(undefined);
  }

  const filtered = useMemo(() => {
    if (mode === "date" && selectedDate) {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      return dbReservations.filter(r => r.date === dateStr);
    }
    if (mode === "range" && rangeFrom) {
      const fromStr = format(rangeFrom, "yyyy-MM-dd");
      const toStr   = rangeTo ? format(rangeTo, "yyyy-MM-dd") : fromStr;
      return dbReservations.filter(r => r.date >= fromStr && r.date <= toStr);
    }
    return dbReservations;
  }, [dbReservations, mode, selectedDate, rangeFrom, rangeTo]);

  const subtitle = useMemo(() => {
    if (mode === "date" && selectedDate) return `Showing data for ${format(selectedDate, "MMM d, yyyy")}`;
    if (mode === "range" && rangeFrom) {
      const from = format(rangeFrom, "MMM d, yyyy");
      const to   = rangeTo ? format(rangeTo, "MMM d, yyyy") : "…";
      return `Showing ${from} — ${to}`;
    }
    return "Live data · all time";
  }, [mode, selectedDate, rangeFrom, rangeTo]);

  const hasFilter = mode !== "all";

  return (
    <div className="p-6 max-w-6xl mx-auto font-sans overflow-auto" data-testid="text-analytics-title">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* All time */}
          <button
            onClick={clearAll}
            className={[
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
              mode === "all"
                ? "bg-[#0D7377] text-white border-[#0D7377]"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
            ].join(" ")}
            data-testid="button-analytics-all"
          >
            All time
          </button>

          {/* Single date */}
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button
                className={[
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                  mode === "date"
                    ? "bg-[#0D7377] text-white border-[#0D7377]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
                ].join(" ")}
                data-testid="button-analytics-date"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {mode === "date" && selectedDate ? format(selectedDate, "MMM d") : "Day"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  setSelectedDate(d);
                  setMode("date");
                  setDateOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Date range */}
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <button
                className={[
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                  mode === "range"
                    ? "bg-[#0D7377] text-white border-[#0D7377]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
                ].join(" ")}
                data-testid="button-analytics-range"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {mode === "range" && rangeFrom
                  ? `${format(rangeFrom, "MMM d")}${rangeTo ? ` – ${format(rangeTo, "MMM d")}` : " – …"}`
                  : "Range"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: rangeFrom, to: rangeTo }}
                onSelect={(r) => {
                  setRangeFrom(r?.from);
                  setRangeTo(r?.to);
                  setMode("range");
                  if (r?.from && r?.to) setRangeOpen(false);
                }}
                numberOfMonths={2}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Clear */}
          {hasFilter && (
            <button
              onClick={clearAll}
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
