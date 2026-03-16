// AnalyticsTab.jsx
// Drop this into your existing app and pass in your sheet data hook.
//
// USAGE:
//   import AnalyticsTab from './AnalyticsTab'
//   <AnalyticsTab useSheetData={useYourSheetHook} />
//
// Your hook should return: { data, loading, error }
// where `data` is an array of sheet tabs, each shaped like:
//   { sheetName: "Sunday 1st Mar", rows: [ [col0, col1, ...], ... ] }
//
// If your hook returns a different shape, adjust the parseSheetData() function below.

import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ─── Colour palette ────────────────────────────────────────────────────────
const AMBER  = "#EF9F27";
const BLUE   = "#378ADD";
const PURPLE = "#7F77DD";
const TEAL   = "#1D9E75";
const GRAY   = "#888780";

function slotColor(slot = "") {
  if (slot.includes("5:00") || slot.toLowerCase().includes("iftar")) return AMBER;
  if (slot.includes("8:00")) return BLUE;
  if (slot.includes("10:00")) return PURPLE;
  return GRAY;
}

function dayColor(dateStr = "") {
  const lower = dateStr.toLowerCase();
  if (lower.startsWith("sunday"))   return BLUE;
  if (lower.startsWith("saturday")) return TEAL;
  if (lower.startsWith("friday"))   return AMBER;
  return "#c8c6be";
}

// ─── Parse raw sheet rows into reservations ────────────────────────────────
function parseSheetData(tabs = []) {
  const marchTabs = tabs.filter(t => t.sheetName?.includes("Mar"));
  const reservations = [];

  for (const tab of marchTabs) {
    let currentSlot = null;

    for (const row of tab.rows ?? []) {
      const [a, b, c, d, e, , , h] = row;

      // Slot header
      if (typeof a === "string" && (a.includes("Iftar") || a.includes("Dinner") || a.includes("dinner"))) {
        if (!a.includes("Teppanyaki")) currentSlot = a.trim();
        continue;
      }
      // Pause slot on Teppanyaki
      if (typeof a === "string" && a.includes("Teppanyaki")) { currentSlot = null; continue; }
      // Skip header / total rows
      if (a === "No." || b === "Total:") continue;

      const pax = typeof c === "number" ? c : parseFloat(c);
      if (currentSlot && b && typeof b === "string" && b.trim().length > 1 && pax > 0) {
        reservations.push({
          date:  tab.sheetName,
          slot:  currentSlot,
          name:  b.trim(),
          pax:   Math.round(pax),
          time:  d ?? "",
          table: e != null ? String(e) : "",
          notes: h ?? "",
        });
      }
    }
  }
  return reservations;
}

// ─── Derived analytics ─────────────────────────────────────────────────────
function computeAnalytics(reservations) {
  const totalCovers = reservations.reduce((s, r) => s + r.pax, 0);
  const totalResos  = reservations.length;
  const avgParty    = totalResos ? +(totalCovers / totalResos).toFixed(1) : 0;

  // By day
  const dayMap = {};
  for (const r of reservations) {
    if (!dayMap[r.date]) dayMap[r.date] = { covers: 0, resos: 0 };
    dayMap[r.date].covers += r.pax;
    dayMap[r.date].resos  += 1;
  }

  // Sort by calendar order (extract day number)
  const dayData = Object.entries(dayMap)
    .map(([date, v]) => {
      const num = parseInt(date.match(/\d+/)?.[0] ?? "0");
      return { date, shortDate: `${num} Mar`, ...v, num };
    })
    .sort((a, b) => a.num - b.num);

  const avgPerDay = dayData.length ? Math.round(totalCovers / dayData.length) : 0;

  // By slot
  const slotMap = {};
  for (const r of reservations) {
    let key = "Other";
    if (r.slot.includes("5:00") || r.slot.toLowerCase().includes("iftar")) key = "Iftar 5:00 PM";
    else if (r.slot.includes("8:00"))  key = "Dinner 8:00 PM";
    else if (r.slot.includes("10:00")) key = "Dinner 10:00 PM";
    if (!slotMap[key]) slotMap[key] = { covers: 0, resos: 0 };
    slotMap[key].covers += r.pax;
    slotMap[key].resos  += 1;
  }
  const slotData = Object.entries(slotMap)
    .map(([slot, v]) => ({ slot, ...v, color: slotColor(slot) }))
    .sort((a, b) => b.covers - a.covers);

  // By day of week
  const dowMap = {};
  for (const r of reservations) {
    const dow = r.date.split(" ")[0];
    if (!dowMap[dow]) dowMap[dow] = { covers: 0, resos: 0 };
    dowMap[dow].covers += r.pax;
    dowMap[dow].resos  += 1;
  }
  const dowOrder = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dowData = Object.entries(dowMap)
    .map(([dow, v]) => ({ dow, ...v }))
    .sort((a, b) => b.covers - a.covers);

  // Weekly buckets (by week of March)
  const weekMap = { "Wk 1 (1–7)": 0, "Wk 2 (8–14)": 0, "Wk 3 (15–18)": 0 };
  for (const { num, covers } of dayData) {
    if (num <= 7)  weekMap["Wk 1 (1–7)"]  += covers;
    else if (num <= 14) weekMap["Wk 2 (8–14)"] += covers;
    else           weekMap["Wk 3 (15–18)"] += covers;
  }
  const weekData = Object.entries(weekMap).map(([week, covers]) => ({ week, covers }));

  // Busiest / quietest
  const sorted     = [...dayData].sort((a, b) => b.covers - a.covers);
  const busiestDay = sorted[0];
  const quietestDay= sorted[sorted.length - 1];
  const busiestDow = dowData[0];
  const busiestSlot= slotData[0];
  const lateShare  = totalCovers
    ? Math.round(((slotMap["Dinner 10:00 PM"]?.covers ?? 0) / totalCovers) * 100)
    : 0;

  return {
    totalCovers, totalResos, avgParty, avgPerDay,
    dayData, slotData, dowData, weekData,
    busiestDay, quietestDay, busiestDow, busiestSlot, lateShare,
  };
}

// ─── Small reusable components ─────────────────────────────────────────────
function KpiCard({ value, label, sub }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-semibold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function InsightCard({ accent, label, value, sub }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 flex gap-3 items-start">
      <div className="w-1 rounded-full self-stretch mt-1" style={{ background: accent }} />
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{children}</p>
      <div className="h-px bg-gray-100 flex-1" />
    </div>
  );
}

function HorizBar({ label, value, maxValue, color, suffix = "" }) {
  const pct = maxValue ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs text-gray-500 w-28 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
        <div
          className="h-full rounded flex items-center px-2 transition-all duration-500"
          style={{ width: `${pct}%`, background: color + "33" }}
        >
          {pct > 30 && (
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
        <p key={i} style={{ color: p.color ?? p.fill }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────
export default function AnalyticsTab({ useSheetData }) {
  const { data, loading, error } = useSheetData();

  const reservations = useMemo(() => parseSheetData(data ?? []), [data]);
  const stats = useMemo(() => computeAnalytics(reservations), [reservations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading reservation data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 text-sm">
        Failed to load data: {String(error)}
      </div>
    );
  }

  if (!reservations.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No March reservation data found.
      </div>
    );
  }

  const { totalCovers, totalResos, avgParty, avgPerDay,
          dayData, slotData, dowData, weekData,
          busiestDay, quietestDay, busiestSlot, lateShare } = stats;

  const maxDayCovers = Math.max(...dayData.map(d => d.covers));
  const maxDowCovers = Math.max(...dowData.map(d => d.covers));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 font-sans">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">March Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Ramadan 2025 · {dayData.length} active days · live from Google Sheets
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard value={totalCovers} label="Total Covers"       sub="guests in March" />
        <KpiCard value={totalResos}  label="Reservations"       sub="bookings logged" />
        <KpiCard value={avgParty}    label="Avg Party Size"     sub="guests per booking" />
        <KpiCard value={avgPerDay}   label="Avg Covers / Day"   sub={`${dayData.length} active days`} />
      </div>

      {/* Insights */}
      <div>
        <SectionTitle>Key Insights</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InsightCard accent={BLUE}   label="Busiest Day"          value={busiestDay?.shortDate}       sub={`${busiestDay?.covers} covers`} />
          <InsightCard accent={TEAL}   label="Busiest Day of Week"  value={busiestDow?.dow}             sub={`${busiestDow?.covers} covers`} />
          <InsightCard accent={AMBER}  label="Busiest Slot"         value={busiestSlot?.slot?.replace("Dinner ","").replace("Iftar ","Iftar ")} sub={`${busiestSlot?.covers} covers`} />
          <InsightCard accent={PURPLE} label="Late Dinner Share"    value={`${lateShare}%`}             sub="covers at 10:00 PM" />
        </div>
      </div>

      {/* Covers by day */}
      <div>
        <SectionTitle>Covers by Day</SectionTitle>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dayData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0ede8" />
              <XAxis dataKey="shortDate" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="covers" name="Covers" radius={[4, 4, 0, 0]}>
                {dayData.map((entry, i) => (
                  <Cell key={i} fill={dayColor(entry.date)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex gap-4 mt-2 justify-end">
            {[["Sunday", BLUE], ["Saturday", TEAL], ["Friday", AMBER], ["Weekday", "#c8c6be"]].map(([l, c]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                <span className="text-xs text-gray-400">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Slot breakdown */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Service Slots</p>
          {slotData.map(s => (
            <HorizBar
              key={s.slot}
              label={s.slot.replace("Dinner ", "").replace("Iftar ", "Iftar ")}
              value={s.covers}
              maxValue={slotData[0]?.covers}
              color={s.color}
              suffix=" covers"
            />
          ))}
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={slotData} dataKey="covers" nameKey="slot" cx="50%" cy="50%"
                  innerRadius={38} outerRadius={58} paddingAngle={3}>
                  {slotData.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day of week */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Day of Week</p>
          {dowData.map(d => (
            <HorizBar
              key={d.dow}
              label={d.dow}
              value={d.covers}
              maxValue={maxDowCovers}
              color={TEAL}
              suffix=" covers"
            />
          ))}
        </div>

        {/* Weekly trend */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Weekly Trend</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weekData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0ede8" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="covers" name="Covers"
                stroke={TEAL} strokeWidth={2.5} dot={{ fill: TEAL, r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
