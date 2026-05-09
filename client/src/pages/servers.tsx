import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Reservation } from "@shared/schema";
import { formatName } from "@/lib/utils";
import { format, startOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronDown, ChevronUp, ArrowUpDown, ChevronRight } from "lucide-react";

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

type ServerStats = {
  name: string;
  reservationsTaken: number;
  totalCovers: number;
  newCustomers: number;
  returningCustomers: number;
  phoneCapture: number;
  tableAssigned: number;
  confirmed: number;
  completed: number;
};

function computeStats(allResos: Reservation[], range: { from: string; to: string } | null): ServerStats[] {
  const phoneFirstDate: Record<string, string> = {};
  for (const r of allResos) {
    if (!isValidPhone(r.phoneNumber)) continue;
    const d = digitsOnly(r.phoneNumber);
    if (!phoneFirstDate[d] || r.date < phoneFirstDate[d]) phoneFirstDate[d] = r.date;
  }
  const inRange = range ? allResos.filter(r => r.date >= range.from && r.date <= range.to) : allResos;
  const stats: Record<string, ServerStats> = {};
  for (const r of inRange) {
    const name = (r.takenBy ?? "").trim();
    if (!name) continue;
    if (!stats[name]) stats[name] = {
      name, reservationsTaken: 0, totalCovers: 0, newCustomers: 0,
      returningCustomers: 0, phoneCapture: 0, tableAssigned: 0, confirmed: 0, completed: 0,
    };
    const s = stats[name];
    s.reservationsTaken++;
    s.totalCovers += r.partySize ?? 0;
    if (isValidPhone(r.phoneNumber)) {
      s.phoneCapture++;
      const first = phoneFirstDate[digitsOnly(r.phoneNumber)];
      if (first === r.date) s.newCustomers++;
      else s.returningCustomers++;
    }
    if (r.tableId && r.tableId > 0) s.tableAssigned++;
    if (["confirmed", "seated", "complete"].includes(r.status)) s.confirmed++;
    if (r.status === "complete") s.completed++;
  }
  return Object.values(stats);
}

type SortKey = keyof Omit<ServerStats, "name">;
type SortDir = "asc" | "desc";

const COLS: { key: SortKey; label: string }[] = [
  { key: "reservationsTaken",  label: "Resos taken" },
  { key: "totalCovers",        label: "Total covers" },
  { key: "newCustomers",       label: "New customers" },
  { key: "returningCustomers", label: "Returning" },
  { key: "phoneCapture",       label: "Phone captured" },
  { key: "tableAssigned",      label: "Table assigned" },
  { key: "confirmed",          label: "Confirmed" },
  { key: "completed",          label: "Completed" },
];

export default function ServersPage() {
  const [, navigate] = useLocation();

  const { data: allResos = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  const [preset, setPreset]       = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo]   = useState<Date | undefined>();
  const [calOpen, setCalOpen]     = useState(false);
  const [sortKey, setSortKey]     = useState<SortKey>("reservationsTaken");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");

  const range = useMemo(() => getRange(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const stats  = useMemo(() => computeStats(allResos, range), [allResos, range]);

  const sorted = useMemo(() => [...stats].sort((a, b) =>
    sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
  ), [stats, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const rangeLabel = useMemo(() => {
    if (preset === "custom" && customFrom) {
      return `${format(customFrom, "MMM d")}${customTo ? ` – ${format(customTo, "MMM d")}` : " – …"}`;
    }
    return PRESET_LABELS[preset];
  }, [preset, customFrom, customTo]);

  return (
    <div className="p-6 max-w-6xl mx-auto" data-testid="page-servers">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Servers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{rangeLabel} · raw counts only</p>
        </div>

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

      {sorted.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <p className="text-sm">No reservations with a "Taken by" field in this period.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                    Name
                  </th>
                  {COLS.map(col => (
                    <th key={col.key}
                      className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap"
                      onClick={() => handleSort(col.key)}
                      data-testid={`th-${col.key}`}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {col.label}
                        {sortKey === col.key
                          ? sortDir === "desc"
                            ? <ChevronDown className="h-3 w-3 text-[#0D7377]" />
                            : <ChevronUp className="h-3 w-3 text-[#0D7377]" />
                          : <ArrowUpDown className="h-3 w-3 opacity-25" />}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 w-8 bg-gray-50" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr key={s.name}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/servers/${encodeURIComponent(s.name)}`)}
                    data-testid={`row-server-${i}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white group-hover:bg-gray-50 transition-colors">
                      {formatName(s.name)}
                    </td>
                    {COLS.map(col => (
                      <td key={col.key}
                        className="px-4 py-3 text-right tabular-nums text-gray-700"
                        data-testid={`cell-${col.key}-${i}`}
                      >
                        {s[col.key]}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-gray-300 group-hover:text-gray-400 transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
