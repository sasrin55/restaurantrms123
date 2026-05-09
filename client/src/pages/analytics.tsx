import { useMemo, useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { formatName } from "@/lib/utils";
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
  grayBar: "#D1D5DB", // softer fill for Walk-ins bars; accent stripes still use gray
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

// ── Multi-table deduplication ─────────────────────────────────────────────────
// Problem: one event (e.g. a 25-pax private dinner) is stored as N rows, one per
// table assigned. Raw counts inflate every aggregate N×.
// Fix (analytics layer only): group rows sharing the same (phone_digits, date, time)
// into a single DedupedVisit. The clean long-term fix is a reservation_tables join
// table so one reservation can reference multiple tables — until that schema
// refactor lands, this dedup lives here.

type DedupedVisit = {
  id: string;            // representative row id (React key)
  phoneDigits: string;   // stripped digits — dedup/lookup key
  phone: string;         // formatted for display
  date: string;
  time: string;
  partySize: number;     // MAX across merged rows (all rows store the same value)
  status: string;        // highest-priority status across merged rows
  previousStatus: string | null;
  tables: string;        // "Table 40, 41, 42" — sorted unique table names joined
  customerName: string;  // from representative (highest-priority-status) row
  comments: string;
};

const STATUS_PRIORITY: Record<string, number> = {
  complete: 6, seated: 5, confirmed: 4, booked: 3, "no-show": 2, cancelled: 1,
};

function deduplicateVisits(reservations: Reservation[]): DedupedVisit[] {
  const groups = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const digits = digitsOnly(r.phoneNumber ?? "");
    // Group by phone+date+time when phone is valid; else treat as a standalone visit
    const key = digits.length >= 10 && !/^0+$/.test(digits)
      ? `${digits}|${r.date}|${r.time}`
      : `solo:${r.id}`;
    const g = groups.get(key);
    if (g) g.push(r); else groups.set(key, [r]);
  }
  const result: DedupedVisit[] = [];
  for (const [, rows] of groups) {
    const rep = rows.reduce((best, r) =>
      (STATUS_PRIORITY[r.status] ?? 0) > (STATUS_PRIORITY[best.status] ?? 0) ? r : best
    , rows[0]);
    const tableNames = [...new Set(rows.map(r => r.tableName).filter(Boolean))].sort();
    result.push({
      id: rep.id,
      phoneDigits: digitsOnly(rep.phoneNumber ?? ""),
      phone: (rep.phoneNumber ?? "").trim(),
      date: rep.date,
      time: rep.time,
      partySize: Math.max(...rows.map(r => r.partySize)),
      status: rep.status,
      previousStatus: (rep as any).previousStatus ?? null,
      tables: tableNames.join(", ") || rep.tableName || "—",
      customerName: rep.customerName,
      comments: rep.comments ?? "",
    });
  }
  return result;
}

function isDedupedWalkIn(v: DedupedVisit): boolean {
  const name  = v.customerName.toLowerCase().trim();
  const phone = v.phone.toLowerCase().trim();
  return (
    v.comments?.toLowerCase().startsWith("walk-in") ||
    name === "walk in" || name === "walk-in" ||
    name === "walk-in guest" || name === "walk in guest" ||
    name.startsWith("walk in") || name.startsWith("walk-in") ||
    phone === "n/a" || phone === "0"
  );
}

function isRealDedupedGuest(v: DedupedVisit): boolean {
  if (isDedupedWalkIn(v)) return false;
  const name = v.customerName.toLowerCase().trim();
  if (PLACEHOLDER_NAMES.has(name)) return false;
  if (/^(hold|block|closed)\b/.test(name)) return false;
  if (v.phoneDigits.length < 10) return false;
  if (/^0+$/.test(v.phoneDigits)) return false;
  return true;
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
      {sub && <p className="text-xs text-gray-500 mt-1 pl-1">{sub}</p>}
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

function isSlotRange(time: string) {
  return time.includes(" - ");
}

// Relative luminance (WCAG formula) for a 6-digit hex color
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Returns "#ffffff" when bar fill is dark enough for white text (contrast ≥ 3.0:1),
// otherwise returns a legible dark gray. 3.0 is AA-Large; our bar text is always
// bold/medium weight so this threshold is appropriate. Results per section color:
//   purple #7F77DD → 3.75:1 → white ✓
//   blue   #378ADD → 3.60:1 → white ✓
//   grayBar #D1D5DB → 1.40:1 → dark ✓  (light fill, dark text)
//   amber  #EF9F27 → 2.17:1 → dark ✓  (warm fill, dark text)
function insideLabelColor(hex: string): string {
  return 1.05 / (luminance(hex) + 0.05) >= 3.0 ? "#ffffff" : "#1F2937";
}

const INSIDE_PX = 80; // bar must be ≥ 80 px wide to fit label inside comfortably

function HorizBar({ label, value, maxValue, color, suffix = "" }: { label: string; value: number; maxValue: number; color: string; suffix?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setTrackW(el.clientWidth);
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pct    = maxValue ? Math.round((value / maxValue) * 100) : 0;
  const barPct = Math.max(pct, 3);
  // Use measured pixels once available; fall back to % heuristic on first render
  const inside = trackW > 0 ? (trackW * barPct / 100) >= INSIDE_PX : pct >= 25;

  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-xs text-gray-500 w-28 shrink-0 truncate">{label}</span>
      <div ref={trackRef} className="flex-1 relative h-5 bg-gray-100 rounded overflow-visible">
        {/* Solid-color fill — needed for white-text contrast check to hold */}
        <div
          className="absolute left-0 top-0 h-full rounded transition-all duration-500"
          style={{ width: `${barPct}%`, background: color }}
        >
          {inside && (
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium whitespace-nowrap"
              style={{ color: insideLabelColor(color) }}
            >
              {value}{suffix}
            </span>
          )}
        </div>
        {/* Outside label — always rendered when bar is too narrow, never suppressed */}
        {!inside && (
          <span
            className="absolute top-1/2 -translate-y-1/2 text-xs text-gray-700 font-medium whitespace-nowrap"
            style={{ left: `calc(${barPct}% + 6px)` }}
          >
            {value}{suffix}
          </span>
        )}
      </div>
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
  // Deduplicate multi-table rows into single visits before any counting
  const allVisits = deduplicateVisits(reservations);
  const active    = allVisits.filter(v => v.status !== "cancelled" && v.status !== "no-show");
  const walkIns   = active.filter(v => isDedupedWalkIn(v));

  const totalCovers = active.reduce((s, v) => s + v.partySize, 0);
  const totalResos  = active.length;
  const avgParty    = totalResos ? +(totalCovers / totalResos).toFixed(1) : 0;

  const dayMap: Record<string, { covers: number; resos: number; tables: Set<string>; dow: string }> = {};
  for (const v of active) {
    if (!dayMap[v.date]) {
      let dow = "";
      try { dow = format(parseISO(v.date), "EEEE"); } catch {}
      dayMap[v.date] = { covers: 0, resos: 0, tables: new Set(), dow };
    }
    dayMap[v.date].covers += v.partySize;
    dayMap[v.date].resos  += 1;
    v.tables.split(", ").forEach(t => { if (t && t !== "—") dayMap[v.date].tables.add(t); });
  }
  const dayData = Object.entries(dayMap)
    .map(([date, dv]) => ({
      date,
      label: (() => { try { return format(parseISO(date), "MMM d"); } catch { return date; } })(),
      covers: dv.covers, resos: dv.resos,
      tablesUsed: dv.tables.size,
      utilPct: Math.round(dv.tables.size / restaurantTables.length * 100),
      dow: dv.dow,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const activeDays = dayData.length;
  const avgPerDay  = activeDays ? Math.round(totalCovers / activeDays) : 0;

  const slotMap: Record<string, { covers: number; resos: number }> = {};
  for (const v of active) {
    if (!slotMap[v.time]) slotMap[v.time] = { covers: 0, resos: 0 };
    slotMap[v.time].covers += v.partySize;
    slotMap[v.time].resos  += 1;
  }
  const slotData = Object.entries(slotMap)
    .map(([slot, sv]) => ({
      slot, ...sv,
      color: slotColor(slot),
      pct: totalCovers ? Math.round(sv.covers / totalCovers * 100) : 0,
    }))
    .sort((a, b) => b.covers - a.covers);

  const dowMap: Record<string, { covers: number; resos: number; days: Set<string> }> = {};
  for (const v of active) {
    let dow = "Unknown";
    try { dow = format(parseISO(v.date), "EEEE"); } catch {}
    if (!dowMap[dow]) dowMap[dow] = { covers: 0, resos: 0, days: new Set() };
    dowMap[dow].covers += v.partySize;
    dowMap[dow].resos  += 1;
    dowMap[dow].days.add(v.date);
  }
  const dowData = Object.entries(dowMap)
    .map(([dow, dv]) => ({
      dow, covers: dv.covers, resos: dv.resos,
      days: dv.days.size,
      avgPerDay: Math.round(dv.covers / dv.days.size),
    }))
    .sort((a, b) => b.covers - a.covers);

  // Table performance: intentionally uses RAW reservations — one row per table
  // assignment is correct for per-table booking counts.
  const tableMap: Record<string, { bookings: number; covers: number }> = {};
  const activeRaw = reservations.filter(r => r.status !== "cancelled" && r.status !== "no-show" && !isWalkIn(r));
  for (const r of activeRaw) {
    if (!tableMap[r.tableName]) tableMap[r.tableName] = { bookings: 0, covers: 0 };
    tableMap[r.tableName].bookings += 1;
    tableMap[r.tableName].covers   += r.partySize;
  }
  const tableData = Object.entries(tableMap)
    .map(([table, tv]) => ({ table, ...tv }))
    .sort((a, b) => b.bookings - a.bookings);

  // Guest analytics: group deduped visits by phone
  // completedVisits/completedCovers drive Top Returning Guests ranking
  const guestMap: Record<string, {
    displayName: string; phone: string; latestDate: string;
    completedVisits: number; completedCovers: number;
    totalVisits: number; totalCovers: number;
  }> = {};
  for (const v of allVisits) {
    if (!isRealDedupedGuest(v)) continue;
    const key = v.phoneDigits;
    if (!guestMap[key]) {
      guestMap[key] = { displayName: v.customerName, phone: v.phone, latestDate: v.date,
        completedVisits: 0, completedCovers: 0, totalVisits: 0, totalCovers: 0 };
    } else if (v.date > guestMap[key].latestDate) {
      guestMap[key].displayName = v.customerName;
      guestMap[key].phone       = v.phone;
      guestMap[key].latestDate  = v.date;
    }
    guestMap[key].totalVisits += 1;
    guestMap[key].totalCovers += v.partySize;
    if (v.status === "complete") {
      guestMap[key].completedVisits += 1;
      guestMap[key].completedCovers += v.partySize;
    }
  }
  // Sort by completed visits (actual shows), secondary by total visits
  const repeatGuests = Object.values(guestMap)
    .filter(g => g.completedVisits >= 1)
    .sort((a, b) => b.completedVisits - a.completedVisits || b.totalVisits - a.totalVisits);

  // Repeat rate: % of real deduped visits from guests with >1 total visit
  const totalRealVisits  = Object.values(guestMap).reduce((s, g) => s + g.totalVisits, 0);
  const repeatResos      = Object.values(guestMap).filter(g => g.totalVisits > 1).reduce((s, g) => s + g.totalVisits, 0);
  const repeatRate       = totalRealVisits ? Math.round(repeatResos / totalRealVisits * 100) : 0;

  const statusCounts: Partial<Record<KnownStatus, number>> = {};
  for (const v of allVisits) {
    const s = v.status as KnownStatus;
    if (s in STATUS_CONFIG) statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const noShows     = allVisits.filter(v => v.status === "no-show");
  const noShowCount = noShows.length;
  const cancelCount = allVisits.filter(v => v.status === "cancelled").length;
  const noShowRate  = allVisits.length ? Math.round(noShowCount / allVisits.length * 100) : 0;
  const cancelRate  = allVisits.length ? Math.round(cancelCount / allVisits.length * 100) : 0;
  const avgUtilPct  = dayData.length ? Math.round(dayData.reduce((s, d) => s + d.utilPct, 0) / dayData.length) : 0;

  const nsFromConfirmed = noShows.filter(v => v.previousStatus === "confirmed").length;
  const nsFromBooked    = noShows.filter(v => v.previousStatus === "booked").length;

  const nsSlotMap: Record<string, number> = {};
  for (const v of noShows) nsSlotMap[v.time] = (nsSlotMap[v.time] ?? 0) + 1;
  const nsSlotData = Object.entries(nsSlotMap)
    .map(([slot, count]) => ({ slot, count, color: slotColor(slot) }))
    .sort((a, b) => b.count - a.count);

  const nsGuestMap: Record<string, { displayName: string; phone: string; phoneDigits: string; latestDate: string; count: number; covers: number }> = {};
  for (const v of noShows) {
    if (!isRealDedupedGuest(v)) continue;
    const key = v.phoneDigits;
    if (!nsGuestMap[key]) {
      nsGuestMap[key] = { displayName: v.customerName, phone: v.phone, phoneDigits: v.phoneDigits, latestDate: v.date, count: 0, covers: 0 };
    } else if (v.date > nsGuestMap[key].latestDate) {
      nsGuestMap[key].displayName = v.customerName;
      nsGuestMap[key].phone       = v.phone;
      nsGuestMap[key].latestDate  = v.date;
    }
    nsGuestMap[key].count  += 1;
    nsGuestMap[key].covers += v.partySize;
  }
  const nsTopGuests = Object.values(nsGuestMap).sort((a, b) => b.covers - a.covers || b.count - a.count);

  const busiestDay  = [...dayData].sort((a, b) => b.covers - a.covers)[0];
  const busiestDow  = dowData[0];
  const busiestSlot = slotData[0];

  // Walk-in analytics
  const walkInCovers   = walkIns.reduce((s, v) => s + v.partySize, 0);
  const walkInPct      = totalResos ? Math.round(walkIns.length / totalResos * 100) : 0;
  const walkInAvgParty = walkIns.length ? +(walkInCovers / walkIns.length).toFixed(1) : 0;

  const wiSlotMap: Record<string, number> = {};
  for (const v of walkIns) wiSlotMap[v.time] = (wiSlotMap[v.time] ?? 0) + 1;
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
    allVisits,
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

const GUEST_PAGE_SIZE = 10;

function LiveAnalytics({ reservations }: { reservations: Reservation[] }) {
  const [expandedPhone, setExpandedPhone]     = useState<string | null>(null);
  const [guestSearch, setGuestSearch]         = useState("");
  const [guestVisible, setGuestVisible]       = useState(GUEST_PAGE_SIZE);
  const [expandedNsPhone, setExpandedNsPhone] = useState<string | null>(null);
  const [nsSearch, setNsSearch]               = useState("");
  const [nsVisible, setNsVisible]             = useState(GUEST_PAGE_SIZE);

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
    allVisits,
  } = stats;

  const filteredGuests = useMemo(() => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return repeatGuests;
    return repeatGuests.filter(g =>
      g.displayName.toLowerCase().includes(q) || g.phone.includes(q)
    );
  }, [repeatGuests, guestSearch]);

  const filteredNsGuests = useMemo(() => {
    const q = nsSearch.trim().toLowerCase();
    if (!q) return nsTopGuests;
    return nsTopGuests.filter(g =>
      g.displayName.toLowerCase().includes(q) || g.phone.includes(q)
    );
  }, [nsTopGuests, nsSearch]);

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
              {slotData.filter(s => isSlotRange(s.slot) || s.covers >= 50).map(s => (
                <HorizBar key={s.slot} label={s.slot}
                  value={s.covers} maxValue={slotData[0]?.covers ?? 1}
                  color={C.purple} suffix=" covers" />
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
            {/* Header + search */}
            <div className="px-4 pt-4 pb-3 flex items-center gap-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1">
                Top returning guests
                <span className="ml-2 font-normal normal-case text-gray-400">
                  ({filteredGuests.length} guests)
                </span>
              </p>
              <Input
                placeholder="Search name or phone…"
                value={guestSearch}
                onChange={e => { setGuestSearch(e.target.value); setGuestVisible(GUEST_PAGE_SIZE); }}
                className="h-7 text-xs w-44 border-gray-200"
                data-testid="input-guest-search"
              />
            </div>

            {filteredGuests.slice(0, guestVisible).map((g, i) => {
              const isOpen = expandedPhone === g.phone;
              // Drill-down uses deduped allVisits for this phone — collapses multi-table rows
              const visits = allVisits
                .filter(v => v.phoneDigits === digitsOnly(g.phone))
                .sort((a, b) => {
                  const dc = b.date.localeCompare(a.date);
                  return dc !== 0 ? dc : b.time.localeCompare(a.time);
                });
              const shown    = visits.slice(0, VISIT_CAP);
              const overflow = visits.length - VISIT_CAP;
              return (
                <div key={g.phone + i} className="border-t border-gray-50">
                  {/* Guest row */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setExpandedPhone(isOpen ? null : g.phone)}
                    data-testid={`button-guest-expand-${i}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                        style={{ background: C.teal + "22", color: C.teal }}>
                        {formatName(g.displayName)[0] ?? ""}
                      </div>
                      <div>
                        <p className="text-sm text-gray-800 leading-tight">{formatName(g.displayName)}</p>
                        <p className="text-xs text-gray-400 leading-tight">{g.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-semibold text-gray-700">{g.completedVisits} completed</span>
                        <span className="text-xs text-gray-500 ml-2">{g.completedCovers} covers</span>
                        {g.totalVisits > g.completedVisits && (
                          <span className="text-xs text-gray-500 ml-2">({g.totalVisits} total)</span>
                        )}
                      </div>
                      <ChevronDown
                        className="h-4 w-4 text-gray-300 transition-transform duration-200 shrink-0"
                        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      />
                    </div>
                  </button>

                  {/* Expanded visit history — deduped, multi-table rows collapsed */}
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
                              <th className="text-left font-medium pb-2 pr-3">Table(s)</th>
                              <th className="text-left font-medium pb-2 pr-3">Status</th>
                              <th className="text-left font-medium pb-2 pr-3">Name used</th>
                              <th className="text-left font-medium pb-2">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shown.map((v) => {
                              const notes = v.comments.trim();
                              let dateLabel = v.date;
                              try { dateLabel = format(parseISO(v.date), "EEE d MMM yyyy"); } catch {}
                              return (
                                <tr key={v.id} className="border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                                  <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{dateLabel}</td>
                                  <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{v.time}</td>
                                  <td className="py-2 pr-3 text-gray-700">{v.partySize}</td>
                                  <td className="py-2 pr-3 text-gray-500 max-w-[160px]">{v.tables}</td>
                                  <td className="py-2 pr-3"><VisitStatusChip status={v.status} /></td>
                                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{formatName(v.customerName)}</td>
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
                        {shown.map((v) => {
                          let dateLabel = v.date;
                          try { dateLabel = format(parseISO(v.date), "EEE d MMM yyyy"); } catch {}
                          return (
                            <div key={v.id} className="bg-white rounded-lg px-3 py-2.5 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-700">{dateLabel} · {v.time}</span>
                                <VisitStatusChip status={v.status} />
                              </div>
                              <div className="text-gray-500">
                                {formatName(v.customerName)} · {v.partySize} pax{v.tables !== "—" ? ` · ${v.tables}` : ""}
                              </div>
                              {v.comments && <div className="text-gray-400 truncate">{v.comments}</div>}
                            </div>
                          );
                        })}
                      </div>

                      {overflow > 0 && (
                        <p className="text-xs text-gray-400 mt-3 text-center">
                          Showing {VISIT_CAP} of {visits.length} visits
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Load more */}
            {filteredGuests.length > guestVisible && (
              <div className="px-4 py-3 border-t border-gray-50 text-center">
                <button
                  onClick={() => setGuestVisible(v => v + GUEST_PAGE_SIZE)}
                  className="text-xs text-[#0D7377] font-medium hover:underline"
                  data-testid="button-guest-load-more"
                >
                  Show more ({filteredGuests.length - guestVisible} remaining)
                </button>
              </div>
            )}
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
              <p className="text-xs text-gray-500 mt-1">
                {`${noShowCount ? Math.round(nsFromConfirmed / noShowCount * 100) : 0}% of no-shows`}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Booked → no-show</p>
              <p className="text-2xl font-semibold text-gray-900">{nsFromBooked}</p>
              <p className="text-xs text-gray-500 mt-1">
                {`${noShowCount ? Math.round(nsFromBooked / noShowCount * 100) : 0}% of no-shows`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {nsSlotData.length > 0 && (
              <ChartCard title="No-shows by time slot">
                {nsSlotData.filter(s => isSlotRange(s.slot) || s.count >= 3).map(s => (
                  <HorizBar key={s.slot} label={s.slot}
                    value={s.count} maxValue={nsSlotData[0]?.count ?? 1}
                    color={C.amber} suffix=" no-shows" />
                ))}
              </ChartCard>
            )}

            {nsTopGuests.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                {/* Header + search */}
                <div className="px-4 pt-4 pb-3 flex items-center gap-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1">
                    Top no-show guests
                    <span className="ml-2 font-normal normal-case text-gray-400">
                      ({filteredNsGuests.length} guests)
                    </span>
                  </p>
                  <Input
                    placeholder="Search name or phone…"
                    value={nsSearch}
                    onChange={e => { setNsSearch(e.target.value); setNsVisible(GUEST_PAGE_SIZE); }}
                    className="h-7 text-xs w-44 border-gray-200"
                    data-testid="input-ns-guest-search"
                  />
                </div>

                {filteredNsGuests.slice(0, nsVisible).map((g, i) => {
                  const isOpen = expandedNsPhone === g.phoneDigits;
                  const visits = allVisits
                    .filter(v => v.phoneDigits === g.phoneDigits && v.status === "no-show")
                    .sort((a, b) => {
                      const dc = b.date.localeCompare(a.date);
                      return dc !== 0 ? dc : b.time.localeCompare(a.time);
                    });
                  const shown    = visits.slice(0, VISIT_CAP);
                  const overflow = visits.length - VISIT_CAP;
                  return (
                    <div key={g.phoneDigits + i} className="border-t border-gray-50">
                      {/* Guest row */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        onClick={() => setExpandedNsPhone(isOpen ? null : g.phoneDigits)}
                        data-testid={`button-ns-guest-expand-${i}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                            style={{ background: C.amber + "22", color: C.amber }}>
                            {formatName(g.displayName)[0] ?? ""}
                          </div>
                          <div>
                            <p className="text-sm text-gray-800 leading-tight">{formatName(g.displayName)}</p>
                            <p className="text-xs text-gray-400 leading-tight">{g.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-semibold text-gray-700">
                              {g.count} {g.count === 1 ? "no-show" : "no-shows"}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">{g.covers} covers</span>
                          </div>
                          <ChevronDown
                            className="h-4 w-4 text-gray-300 transition-transform duration-200 shrink-0"
                            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                          />
                        </div>
                      </button>

                      {/* Expanded no-show history */}
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
                                  <th className="text-left font-medium pb-2 pr-3">Table(s)</th>
                                  <th className="text-left font-medium pb-2 pr-3">Name used</th>
                                  <th className="text-left font-medium pb-2">Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {shown.map((v) => {
                                  const notes = v.comments.trim();
                                  let dateLabel = v.date;
                                  try { dateLabel = format(parseISO(v.date), "EEE d MMM yyyy"); } catch {}
                                  return (
                                    <tr key={v.id} className="border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{dateLabel}</td>
                                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{v.time}</td>
                                      <td className="py-2 pr-3 text-gray-700">{v.partySize}</td>
                                      <td className="py-2 pr-3 text-gray-500 max-w-[160px]">{v.tables}</td>
                                      <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{formatName(v.customerName)}</td>
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
                            {shown.map((v) => {
                              let dateLabel = v.date;
                              try { dateLabel = format(parseISO(v.date), "EEE d MMM yyyy"); } catch {}
                              return (
                                <div key={v.id} className="bg-white rounded-lg px-3 py-2.5 text-xs space-y-1">
                                  <span className="font-medium text-gray-700">{dateLabel} · {v.time}</span>
                                  <div className="text-gray-500">
                                    {formatName(v.customerName)} · {v.partySize} pax{v.tables !== "—" ? ` · ${v.tables}` : ""}
                                  </div>
                                  {v.comments && <div className="text-gray-400 truncate">{v.comments}</div>}
                                </div>
                              );
                            })}
                          </div>

                          {overflow > 0 && (
                            <p className="text-xs text-gray-400 mt-3 text-center">
                              Showing {VISIT_CAP} of {visits.length} no-shows
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Load more */}
                {filteredNsGuests.length > nsVisible && (
                  <div className="px-4 py-3 border-t border-gray-50 text-center">
                    <button
                      onClick={() => setNsVisible(v => v + GUEST_PAGE_SIZE)}
                      className="text-xs text-[#0D7377] font-medium hover:underline"
                      data-testid="button-ns-guest-load-more"
                    >
                      Show more ({filteredNsGuests.length - nsVisible} remaining)
                    </button>
                  </div>
                )}
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
            <KpiCard value={walkIns.length}    label="Walk-in visits"   sub="guests without a reservation" accent={C.gray} />
            <KpiCard value={walkInCovers}      label="Walk-in covers"   sub="total guests"                 accent={C.gray} />
            <KpiCard value={`${walkInPct}%`}   label="% of all visits"  sub="share of total bookings"      accent={C.gray} />
            <div className="bg-gray-50 rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ background: C.gray }} />
              <p className="text-xs text-gray-400 mb-1 pl-1">Peak walk-in slot</p>
              <p className="text-lg font-semibold text-gray-900 leading-tight pl-1">{wiPeakSlot?.slot ?? "—"}</p>
              <p className="text-xs text-gray-400 mt-1 pl-1">{wiPeakSlot?.count ?? 0} walk-ins</p>
            </div>
          </div>

          {wiSlotData.length > 0 && (
            <ChartCard title="Walk-ins by time slot">
              {wiSlotData.filter(s => isSlotRange(s.slot) || s.count >= 3).map(s => (
                <HorizBar key={s.slot} label={s.slot}
                  value={s.count} maxValue={wiSlotData[0]?.count ?? 1}
                  color={C.grayBar} suffix=" walk-ins" />
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
            accent={C.blue} />
          <KpiCard
            value={tableData[tableData.length - 1]?.table ?? "—"}
            label="Least used table"
            sub={`${tableData[tableData.length - 1]?.bookings ?? 0} bookings`}
            accent={C.blue} />
        </div>

        {tableData.length > 0 && (
          <ChartCard title="Table performance">
            {tableData.slice(0, 10).map((t) => (
              <HorizBar key={t.table} label={t.table}
                value={t.bookings} maxValue={maxTableBookings}
                color={C.blue} suffix=" bookings" />
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
