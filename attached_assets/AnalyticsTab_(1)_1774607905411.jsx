// AnalyticsTab.jsx — Seated Analytics Dashboard v2
// Sections: Performance · Demand Patterns · Guest Behavior · Operations
//
// USAGE:
//   import AnalyticsTab from './AnalyticsTab'
//   <AnalyticsTab useSheetData={useYourSheetHook} />
//
// Hook must return: { data: [{ sheetName, rows }], loading, error }
// Adjust parseSheetData() below if your hook returns a different shape.

import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Palette ──────────────────────────────────────────────────────────────
const C = {
  amber:  "#EF9F27",
  blue:   "#378ADD",
  purple: "#7F77DD",
  teal:   "#1D9E75",
  gray:   "#888780",
  muted:  "#c8c6be",
};

function slotColor(slot = "") {
  if (slot.includes("5:00") || slot.toLowerCase().includes("iftar")) return C.amber;
  if (slot.includes("8:00"))  return C.blue;
  if (slot.includes("10:00")) return C.purple;
  return C.gray;
}

function dayColor(dateStr = "") {
  const l = dateStr.toLowerCase();
  if (l.startsWith("sunday"))   return C.blue;
  if (l.startsWith("saturday")) return C.teal;
  if (l.startsWith("friday"))   return C.amber;
  return C.muted;
}

// ─── Parser ───────────────────────────────────────────────────────────────
function parseSheetData(tabs = []) {
  const marchTabs = tabs.filter(t => t.sheetName?.includes("Mar"));
  const reservations = [];
  for (const tab of marchTabs) {
    let currentSlot = null;
    for (const row of tab.rows ?? []) {
      const [a, b, c, , e, , , h] = row;
      if (typeof a === "string" && (a.includes("Iftar") || a.includes("Dinner"))) {
        if (!a.includes("Teppanyaki")) currentSlot = a.trim();
        continue;
      }
      if (typeof a === "string" && a.includes("Teppanyaki")) { currentSlot = null; continue; }
      if (a === "No." || b === "Total:") continue;
      const pax = typeof c === "number" ? c : parseFloat(c);
      if (currentSlot && b && typeof b === "string" && b.trim().length > 1 && pax > 0) {
        const slot =
          currentSlot.includes("5:00") || currentSlot.toLowerCase().includes("iftar")
            ? "Iftar 5:00 PM"
            : currentSlot.includes("8:00") ? "Dinner 8:00 PM" : "Dinner 10:00 PM";
        reservations.push({
          date:  tab.sheetName,
          slot,
          name:  b.trim(),
          pax:   Math.round(pax),
          table: e != null ? String(e) : "",
          notes: h ?? "",
        });
      }
    }
  }
  return reservations;
}

// ─── Analytics engine ─────────────────────────────────────────────────────
function computeAnalytics(reservations) {
  const totalCovers = reservations.reduce((s, r) => s + r.pax, 0);
  const totalResos  = reservations.length;
  const avgParty    = totalResos ? +(totalCovers / totalResos).toFixed(1) : 0;

  // By day
  const dayMap = {};
  for (const r of reservations) {
    if (!dayMap[r.date]) dayMap[r.date] = { covers: 0, resos: 0, tables: new Set() };
    dayMap[r.date].covers += r.pax;
    dayMap[r.date].resos  += 1;
    if (r.table) dayMap[r.date].tables.add(r.table);
  }
  const dayData = Object.entries(dayMap)
    .map(([date, v]) => ({
      date,
      shortDate: `${date.match(/\d+/)?.[0]} Mar`,
      covers:     v.covers,
      resos:      v.resos,
      tablesUsed: v.tables.size,
      utilPct:    Math.round(v.tables.size / 18 * 100),
      num:        parseInt(date.match(/\d+/)?.[0] ?? "0"),
    }))
    .sort((a, b) => a.num - b.num);

  const activeDays = dayData.length;
  const avgPerDay  = activeDays ? Math.round(totalCovers / activeDays) : 0;

  // By slot
  const slotMap = {};
  for (const r of reservations) {
    if (!slotMap[r.slot]) slotMap[r.slot] = { covers: 0, resos: 0 };
    slotMap[r.slot].covers += r.pax;
    slotMap[r.slot].resos  += 1;
  }
  const slotData = Object.entries(slotMap)
    .map(([slot, v]) => ({
      slot, ...v,
      color: slotColor(slot),
      pct: totalCovers ? Math.round(v.covers / totalCovers * 100) : 0,
    }))
    .sort((a, b) => b.covers - a.covers);

  // By DOW
  const dowMap = {};
  for (const r of reservations) {
    const dow = r.date.split(" ")[0];
    if (!dowMap[dow]) dowMap[dow] = { covers: 0, resos: 0, days: new Set() };
    dowMap[dow].covers += r.pax;
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
  const weekMap = { "Wk 1 (1–7)": 0, "Wk 2 (8–14)": 0, "Wk 3 (15–18)*": 0 };
  for (const { num, covers } of dayData) {
    if (num <= 7)       weekMap["Wk 1 (1–7)"]    += covers;
    else if (num <= 14) weekMap["Wk 2 (8–14)"]   += covers;
    else                weekMap["Wk 3 (15–18)*"] += covers;
  }
  const weekData = Object.entries(weekMap).map(([week, covers]) => ({ week, covers }));

  // Repeat guests
  const nameMap = {};
  for (const r of reservations) {
    const key = r.name.toLowerCase().trim();
    if (!nameMap[key]) nameMap[key] = { displayName: r.name, visits: 0, covers: 0 };
    nameMap[key].visits += 1;
    nameMap[key].covers += r.pax;
  }
  const repeatGuests = Object.values(nameMap)
    .filter(g => g.visits > 1 && !g.displayName.toLowerCase().includes("walk"))
    .sort((a, b) => b.visits - a.visits);
  const repeatResos = repeatGuests.reduce((s, g) => s + g.visits, 0);
  const repeatRate  = totalResos ? Math.round(repeatResos / totalResos * 100) : 0;

  // Table utilisation
  const tableMap = {};
  for (const r of reservations) {
    if (!r.table || r.table.includes(",")) continue;
    if (!tableMap[r.table]) tableMap[r.table] = { bookings: 0, covers: 0 };
    tableMap[r.table].bookings += 1;
    tableMap[r.table].covers   += r.pax;
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

  return {
    totalCovers, totalResos, avgParty, avgPerDay, activeDays,
    dayData, slotData, dowData, weekData,
    busiestDay, busiestDow, busiestSlot,
    repeatGuests, repeatRate,
    tableData, avgUtilPct,
  };
}

// ─── UI primitives ────────────────────────────────────────────────────────
function SectionHeader({ label }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest whitespace-nowrap">
        {label}
      </h2>
      <div className="h-px bg-gray-100 flex-1" />
    </div>
  );
}

function KpiCard({ value, label, sub, accent }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 relative overflow-hidden">
      {accent && (
        <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ background: accent }} />
      )}
      <p className="text-xs text-gray-400 mb-1 pl-1">{label}</p>
      <p className="text-3xl font-semibold text-gray-900 leading-none pl-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1 pl-1">{sub}</p>}
    </div>
  );
}

function PlaceholderCard({ label, note }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-200">—</p>
      <p className="text-xs text-gray-300 mt-1 leading-snug">{note}</p>
    </div>
  );
}

function ChartCard({ title, children, className = "" }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-4 ${className}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

function HorizBar({ label, value, maxValue, color, suffix = "" }) {
  const pct = maxValue ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-xs text-gray-500 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
        <div
          className="h-full rounded flex items-center px-2 transition-all duration-500"
          style={{ width: `${Math.max(pct, 3)}%`, background: color + "33" }}
        >
          {pct > 28 && (
            <span className="text-xs font-medium" style={{ color }}>{value}{suffix}</span>
          )}
        </div>
      </div>
      <span className="text-xs text-gray-400 w-16 text-right shrink-0">{value}{suffix}</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? p.fill }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────
export default function AnalyticsTab({ useSheetData }) {
  const { data, loading, error } = useSheetData();
  const reservations = useMemo(() => parseSheetData(data ?? []), [data]);
  const stats        = useMemo(() => computeAnalytics(reservations), [reservations]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      Loading reservation data…
    </div>
  );
  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-400 text-sm">
      Failed to load: {String(error)}
    </div>
  );
  if (!reservations.length) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      No March data found.
    </div>
  );

  const {
    totalCovers, totalResos, avgParty, avgPerDay, activeDays,
    dayData, slotData, dowData, weekData,
    busiestDay, busiestDow, busiestSlot,
    repeatGuests, repeatRate,
    tableData, avgUtilPct,
  } = stats;

  const maxDowCovers     = Math.max(...dowData.map(d => d.covers));
  const maxTableBookings = tableData[0]?.bookings ?? 1;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-10 font-sans">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          March 2025 · Ramadan · {activeDays} active days · live from Google Sheets
        </p>
      </div>

      {/* ══ SECTION 1: PERFORMANCE ══ */}
      <div>
        <SectionHeader label="Performance" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard value={totalCovers} label="Total covers"
            sub="guests served in March"                 accent={C.teal}   />
          <KpiCard value={totalResos}  label="Reservations"
            sub="total bookings logged"                  accent={C.blue}   />
          <KpiCard value={avgParty}    label="Avg party size"
            sub="guests per booking"                     accent={C.amber}  />
          <KpiCard value={avgPerDay}   label="Avg covers / day"
            sub={`based on ${activeDays} active days`}   accent={C.purple} />
        </div>
      </div>

      {/* ══ SECTION 2: DEMAND PATTERNS ══ */}
      <div>
        <SectionHeader label="Demand Patterns" />

        {/* Top 3 summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Busiest day</p>
            <p className="text-xl font-semibold text-gray-900">{busiestDay?.shortDate}</p>
            <p className="text-xs text-gray-400 mt-1">
              {busiestDay?.covers} covers · {busiestDay?.resos} reservations
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Busiest day of week</p>
            <p className="text-xl font-semibold text-gray-900">{busiestDow?.dow}</p>
            <p className="text-xs text-gray-400 mt-1">
              avg {busiestDow?.avgPerDay} covers/day · {busiestDow?.days} {busiestDow?.dow}s in March
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-gray-400 mb-1">Busiest slot</p>
            <p className="text-xl font-semibold text-gray-900">
              {busiestSlot?.slot?.replace("Dinner ", "").replace("Iftar ", "Iftar ")}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {busiestSlot?.pct}% of monthly covers · {busiestSlot?.covers} guests
            </p>
          </div>
        </div>

        {/* Covers by day — full width */}
        <ChartCard title="Covers by day" className="mb-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dayData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0ede8" />
              <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#888" }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="covers" name="Covers" radius={[4, 4, 0, 0]}>
                {dayData.map((entry, i) => <Cell key={i} fill={dayColor(entry.date)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3 justify-end flex-wrap">
            {[["Sunday", C.blue], ["Saturday", C.teal], ["Friday", C.amber], ["Weekday", C.muted]].map(([l, c]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                <span className="text-xs text-gray-400">{l}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Service slot + Day of week — side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <ChartCard title="By service slot">
            {slotData.map(s => (
              <HorizBar key={s.slot}
                label={s.slot.replace("Dinner ", "").replace("Iftar ", "Iftar ")}
                value={s.covers} maxValue={slotData[0]?.covers}
                color={s.color} suffix=" covers" />
            ))}
            <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
              {slotData.map(s => (
                <div key={s.slot} className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">
                    {s.slot.replace("Dinner ", "").replace("Iftar ", "Iftar ")}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: s.color }}>
                    {s.pct}%
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="By day of week">
            {dowData.map(d => (
              <HorizBar key={d.dow} label={d.dow}
                value={d.covers} maxValue={maxDowCovers}
                color={C.teal} suffix=" covers" />
            ))}
          </ChartCard>
        </div>

        {/* Weekly trend — full width */}
        <ChartCard title="Weekly trend">
          <p className="text-xs text-gray-300 -mt-1 mb-3">* Week 3 is partial (4 days)</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weekData} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0ede8" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#888" }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="covers" name="Covers"
                stroke={C.teal} strokeWidth={2.5} dot={{ fill: C.teal, r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ══ SECTION 3: GUEST BEHAVIOR ══ */}
      <div>
        <SectionHeader label="Guest Behavior" />

        {/* 3 KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <KpiCard
            value={`${repeatRate}%`}
            label="Repeat guest rate"
            sub="of reservations from returning guests"
            accent={C.teal} />
          <PlaceholderCard
            label="Cancellation rate"
            note="Add a Status column to your sheet" />
          <PlaceholderCard
            label="No show rate"
            note="Add a Status column to your sheet" />
        </div>

        {/* Top returning guests — full width */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Top returning guests
          </p>
          {repeatGuests.length === 0 ? (
            <p className="text-sm text-gray-300">No repeat guests detected.</p>
          ) : (
            <div>
              {repeatGuests.slice(0, 8).map((g, i) => (
                <div key={i}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                      style={{ background: C.teal + "22", color: C.teal }}
                    >
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
      </div>

      {/* ══ SECTION 4: OPERATIONS ══ */}
      <div>
        <SectionHeader label="Operations" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiCard
            value={`${avgUtilPct}%`}
            label="Avg table utilisation"
            sub="booked tables vs 18 available"
            accent={C.blue} />
          <KpiCard
            value={tableData[0]?.table ? `Table ${tableData[0].table}` : "—"}
            label="Most used table"
            sub={`${tableData[0]?.bookings ?? 0} bookings this month`}
            accent={C.teal} />
          <KpiCard
            value={tableData[tableData.length - 1]?.table ? `Table ${tableData[tableData.length - 1].table}` : "—"}
            label="Least used table"
            sub={`${tableData[tableData.length - 1]?.bookings ?? 0} bookings this month`}
            accent={C.muted} />
          <PlaceholderCard
            label="Avg table turnover time"
            note="Requires end-time data in your sheet" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChartCard title="Table utilisation by day">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dayData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f0ede8" />
                <XAxis dataKey="shortDate" tick={{ fontSize: 10, fill: "#888" }}
                  axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false}
                  unit="%" domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />}
                  formatter={(v) => [`${v}%`, "Utilisation"]} />
                <Bar dataKey="utilPct" name="Utilisation %" radius={[3, 3, 0, 0]}
                  fill={C.blue + "66"} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Table performance">
            {tableData.slice(0, 10).map((t, i) => (
              <HorizBar key={t.table}
                label={`Table ${t.table}`}
                value={t.bookings}
                maxValue={maxTableBookings}
                color={i < 3 ? C.teal : C.gray}
                suffix=" bookings" />
            ))}
          </ChartCard>
        </div>
      </div>

    </div>
  );
}
