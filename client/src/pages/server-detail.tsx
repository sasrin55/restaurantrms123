import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Reservation } from "@shared/schema";
import { formatName } from "@/lib/utils";
import { format, parseISO, startOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronDown } from "lucide-react";
import { Link } from "wouter";

function digitsOnly(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}
function isValidPhone(phone: string): boolean {
  const d = digitsOnly(phone);
  return d.length >= 10 && !/^0+$/.test(d);
}

type DatePreset = "today" | "week" | "month" | "lastmonth" | "all" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today", week: "This week", month: "This month",
  lastmonth: "Last month", all: "All time", custom: "Custom",
};

function getRange(preset: DatePreset, from?: Date, to?: Date): { from: string; to: string } | null {
  const today = format(new Date(), "yyyy-MM-dd");
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") return { from: format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"), to: today };
  if (preset === "month") return { from: format(startOfMonth(new Date()), "yyyy-MM-dd"), to: today };
  if (preset === "lastmonth") {
    const prev = subMonths(new Date(), 1);
    return { from: format(startOfMonth(prev), "yyyy-MM-dd"), to: format(endOfMonth(prev), "yyyy-MM-dd") };
  }
  if (preset === "all") return null;
  if (preset === "custom" && from) return {
    from: format(from, "yyyy-MM-dd"),
    to: to ? format(to, "yyyy-MM-dd") : format(from, "yyyy-MM-dd"),
  };
  return null;
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  complete:  { bg: "#dcfce7", text: "#15803d" },
  confirmed: { bg: "#dbeafe", text: "#1d4ed8" },
  booked:    { bg: "#dbeafe", text: "#1d4ed8" },
  seated:    { bg: "#ecfccb", text: "#4A5D23" },
  "no-show": { bg: "#fff7ed", text: "#c2410c" },
  cancelled: { bg: "#f3f4f6", text: "#6b7280" },
};

function StatusChip({ status }: { status: string }) {
  const st = STATUS_STYLE[status] ?? STATUS_STYLE["booked"];
  return (
    <span className="inline-block text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: st.bg, color: st.text }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-semibold text-gray-900 leading-none tabular-nums">{value}</p>
    </div>
  );
}

export default function ServerDetailPage() {
  const { name: encodedName } = useParams<{ name: string }>();
  const [, navigate] = useLocation();
  const name = decodeURIComponent(encodedName ?? "");

  const { data: allResos = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  const [preset, setPreset]         = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo]     = useState<Date | undefined>();
  const [calOpen, setCalOpen]       = useState(false);
  const [openHygiene, setOpenHygiene] = useState<string | null>(null);

  const range = useMemo(() => getRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const lifetimeResos = useMemo(
    () => allResos.filter(r => (r.takenBy ?? "").trim().toLowerCase() === name.toLowerCase()),
    [allResos, name],
  );

  const inRange = useMemo(() => {
    return range
      ? lifetimeResos.filter(r => r.date >= range.from && r.date <= range.to)
      : lifetimeResos;
  }, [lifetimeResos, range]);

  const phoneFirstDate = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of allResos) {
      if (!isValidPhone(r.phoneNumber)) continue;
      const d = digitsOnly(r.phoneNumber);
      if (!m[d] || r.date < m[d]) m[d] = r.date;
    }
    return m;
  }, [allResos]);

  const stats = useMemo(() => {
    let reservationsTaken = 0, totalCovers = 0, newCustomers = 0,
        returningCustomers = 0, phoneCapture = 0, tableAssigned = 0,
        confirmed = 0, completed = 0;
    for (const r of inRange) {
      reservationsTaken++;
      totalCovers += r.partySize ?? 0;
      if (isValidPhone(r.phoneNumber)) {
        phoneCapture++;
        const first = phoneFirstDate[digitsOnly(r.phoneNumber)];
        if (first === r.date) newCustomers++;
        else returningCustomers++;
      }
      if (r.tableId && r.tableId > 0) tableAssigned++;
      if (["confirmed", "seated", "complete"].includes(r.status)) confirmed++;
      if (r.status === "complete") completed++;
    }
    return { reservationsTaken, totalCovers, newCustomers, returningCustomers, phoneCapture, tableAssigned, confirmed, completed };
  }, [inRange, phoneFirstDate]);

  const dailyData = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of inRange) m[r.date] = (m[r.date] ?? 0) + 1;
    return Object.entries(m)
      .map(([date, count]) => ({
        date, count,
        label: (() => { try { return format(parseISO(date), "MMM d"); } catch { return date; } })(),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [inRange]);

  const recentBookings = useMemo(() =>
    [...inRange]
      .sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        return dc !== 0 ? dc : b.time.localeCompare(a.time);
      })
      .slice(0, 50),
    [inRange],
  );

  const missingPhone = useMemo(() => inRange.filter(r => !isValidPhone(r.phoneNumber)), [inRange]);
  const missingTable = useMemo(() => inRange.filter(r => !r.tableId || r.tableId <= 0), [inRange]);
  const missingName  = useMemo(() => inRange.filter(r => !(r.customerName ?? "").trim()), [inRange]);

  if (!name) return <div className="p-6 text-gray-400 text-sm">Server not found.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8" data-testid="page-server-detail">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link href="/servers"
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2 transition-colors"
            data-testid="link-back-servers"
          >
            <ChevronLeft className="h-4 w-4" /> Servers
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{formatName(name)}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {lifetimeResos.length} reservations taken · all time
          </p>
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["today", "week", "month", "lastmonth", "all"] as DatePreset[]).map(p => (
            <button key={p} onClick={() => setPreset(p)}
              className={[
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                preset === p
                  ? "bg-[#0D7377] text-white border-[#0D7377]"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
              ].join(" ")}
              data-testid={`btn-preset-${p}`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <button
                className={[
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                  preset === "custom"
                    ? "bg-[#0D7377] text-white border-[#0D7377]"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700",
                ].join(" ")}
                data-testid="btn-preset-custom"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {preset === "custom" && customFrom
                  ? `${format(customFrom, "MMM d")}${customTo ? ` – ${format(customTo, "MMM d")}` : " – …"}`
                  : "Custom"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: customFrom, to: customTo }}
                onSelect={r => {
                  setCustomFrom(r?.from);
                  setCustomTo(r?.to);
                  setPreset("custom");
                  if (r?.from && r?.to) setCalOpen(false);
                }}
                numberOfMonths={2}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {inRange.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          No reservations taken in this period.
        </div>
      ) : (
        <>
          {/* Metric row 1 — booking counts */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Bookings</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard label="Reservations taken" value={stats.reservationsTaken} />
              <MetricCard label="Total covers"        value={stats.totalCovers} />
              <MetricCard label="New customers"       value={stats.newCustomers} />
              <MetricCard label="Returning customers" value={stats.returningCustomers} />
            </div>
          </div>

          {/* Metric row 2 — completions */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Follow-through</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard label="Phone captured" value={stats.phoneCapture} />
              <MetricCard label="Table assigned" value={stats.tableAssigned} />
              <MetricCard label="Confirmed"      value={stats.confirmed} />
              <MetricCard label="Completed"      value={stats.completed} />
            </div>
          </div>

          {/* Daily bookings chart */}
          {dailyData.length > 1 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Reservations per day
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f0ede8" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    content={({ active, payload, label: lbl }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white border border-gray-100 rounded-lg shadow-sm px-3 py-2 text-xs">
                          <p className="font-medium text-gray-700 mb-1">{lbl}</p>
                          <p style={{ color: "#7F77DD" }}>Reservations: <strong>{payload[0]?.value}</strong></p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" fill="#7F77DD" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recent bookings */}
          {recentBookings.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Recent bookings
                  <span className="ml-2 font-normal normal-case text-gray-400">
                    (showing {recentBookings.length} of {inRange.length})
                  </span>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400">
                      <th className="text-left font-medium px-4 py-2.5">Date</th>
                      <th className="text-left font-medium px-4 py-2.5">Time</th>
                      <th className="text-left font-medium px-4 py-2.5">Guest</th>
                      <th className="text-right font-medium px-4 py-2.5">Pax</th>
                      <th className="text-left font-medium px-4 py-2.5">Table</th>
                      <th className="text-left font-medium px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map(r => {
                      let dateLabel = r.date;
                      try { dateLabel = format(parseISO(r.date), "EEE d MMM"); } catch {}
                      return (
                        <tr key={r.id}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => navigate(`/`)}
                          data-testid={`row-booking-${r.id}`}
                        >
                          <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{dateLabel}</td>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.time}</td>
                          <td className="px-4 py-2.5 text-gray-700">{formatName(r.customerName) || <span className="italic text-gray-300">no name</span>}</td>
                          <td className="px-4 py-2.5 text-gray-700 text-right tabular-nums">{r.partySize}</td>
                          <td className="px-4 py-2.5 text-gray-500">{r.tableName || "—"}</td>
                          <td className="px-4 py-2.5"><StatusChip status={r.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data hygiene */}
          {(missingPhone.length > 0 || missingTable.length > 0 || missingName.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Data hygiene</p>
              <div className="space-y-2">
                {[
                  { key: "phone", count: missingPhone.length, label: "bookings missing a valid phone", resos: missingPhone },
                  { key: "table", count: missingTable.length, label: "bookings missing a table assignment", resos: missingTable },
                  { key: "name",  count: missingName.length,  label: "bookings missing customer name", resos: missingName },
                ].filter(h => h.count > 0).map(h => {
                  const isOpen = openHygiene === h.key;
                  return (
                    <div key={h.key} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        onClick={() => setOpenHygiene(isOpen ? null : h.key)}
                        data-testid={`btn-hygiene-${h.key}`}
                      >
                        <span className="text-sm text-gray-700">
                          <strong className="text-gray-900">{h.count}</strong>{" "}{h.label}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-gray-50 px-4 pb-4 pt-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 border-b border-gray-100">
                                <th className="text-left font-medium pb-2 pr-4">Date</th>
                                <th className="text-left font-medium pb-2 pr-4">Time</th>
                                <th className="text-left font-medium pb-2 pr-4">Guest</th>
                                <th className="text-left font-medium pb-2">Phone on file</th>
                              </tr>
                            </thead>
                            <tbody>
                              {h.resos.slice(0, 25).map(r => {
                                let dateLabel = r.date;
                                try { dateLabel = format(parseISO(r.date), "EEE d MMM"); } catch {}
                                return (
                                  <tr key={r.id}
                                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                                    data-testid={`row-hygiene-${h.key}-${r.id}`}
                                  >
                                    <td className="py-2 pr-4 text-gray-700 whitespace-nowrap">{dateLabel}</td>
                                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{r.time}</td>
                                    <td className="py-2 pr-4 text-gray-700">
                                      {formatName(r.customerName) || <span className="italic text-gray-300">no name</span>}
                                    </td>
                                    <td className="py-2 text-gray-400">{r.phoneNumber || "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {h.resos.length > 25 && (
                            <p className="text-xs text-gray-400 mt-3 text-center">
                              Showing 25 of {h.resos.length}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
