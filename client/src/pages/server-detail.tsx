import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Reservation } from "@shared/schema";
import { formatName } from "@/lib/utils";
import { format, parseISO, startOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

function digitsOnly(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}
function isValidPhone(phone: string): boolean {
  const d = digitsOnly(phone);
  return d.length >= 10 && !/^0+$/.test(d);
}
function isWalkInReso(r: Reservation): boolean {
  const name     = (r.customerName ?? "").toLowerCase().trim();
  const comments = (r.comments ?? "").toLowerCase().trim();
  const phone    = (r.phoneNumber ?? "").toLowerCase().trim();
  return (
    r.isWalkIn === true ||
    comments.startsWith("walk-in") ||
    name === "walk in" || name === "walk-in" ||
    name === "walk-in guest" || name === "walk in guest" ||
    name.startsWith("walk in") || name.startsWith("walk-in") ||
    phone === "n/a" || phone === "0"
  );
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

  const stats = useMemo(() => {
    let reservationsTaken = 0, walkInsTaken = 0, phoneMissing = 0;
    for (const r of inRange) {
      if (isWalkInReso(r)) walkInsTaken++;
      else reservationsTaken++;
      if (!isValidPhone(r.phoneNumber)) phoneMissing++;
    }
    return { reservationsTaken, walkInsTaken, phoneMissing };
  }, [inRange]);

  const badPhoneBookings = useMemo(
    () => inRange
      .filter(r => !isValidPhone(r.phoneNumber))
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
    [inRange],
  );

  if (!name) return <div className="p-6 text-gray-400 text-sm">Server not found.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-server-detail">

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
            {lifetimeResos.length} bookings taken · all time
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

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Reservations Taken</p>
          <p className="text-3xl font-semibold text-gray-900 leading-none tabular-nums">{stats.reservationsTaken}</p>
          <p className="text-xs text-gray-400 mt-1.5">advance bookings only</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Walk-ins Taken</p>
          <p className="text-3xl font-semibold text-gray-900 leading-none tabular-nums">{stats.walkInsTaken}</p>
          <p className="text-xs text-gray-400 mt-1.5">walk-in bookings only</p>
        </div>
        <div className={`rounded-xl p-4 ${stats.phoneMissing > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
          <p className="text-xs text-gray-400 mb-1">Phone Not Filled Correctly</p>
          <p className={`text-3xl font-semibold leading-none tabular-nums ${stats.phoneMissing > 0 ? "text-amber-700" : "text-gray-900"}`}>
            {stats.phoneMissing}
          </p>
          <p className="text-xs text-gray-400 mt-1.5">in this period</p>
        </div>
      </div>

      {/* Bad phone bookings list */}
      {inRange.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No bookings in this period.
        </div>
      ) : badPhoneBookings.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">All bookings in this period have a valid phone number.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Bookings with missing or bad phone
            </p>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {badPhoneBookings.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="text-left font-medium px-4 py-2.5">Date</th>
                  <th className="text-left font-medium px-4 py-2.5">Time</th>
                  <th className="text-left font-medium px-4 py-2.5">Guest</th>
                  <th className="text-right font-medium px-4 py-2.5">Pax</th>
                  <th className="text-left font-medium px-4 py-2.5">Phone on file</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {badPhoneBookings.map(r => {
                  let dateLabel = r.date;
                  try { dateLabel = format(parseISO(r.date), "EEE d MMM"); } catch {}
                  return (
                    <tr key={r.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/`)}
                      data-testid={`row-badphone-${r.id}`}
                    >
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{dateLabel}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.time}</td>
                      <td className="px-4 py-2.5 text-gray-700">
                        {formatName(r.customerName) || <span className="italic text-gray-300">no name</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 text-right tabular-nums">{r.partySize}</td>
                      <td className="px-4 py-2.5 text-amber-600 font-mono">
                        {r.phoneNumber || <span className="italic text-gray-300 font-sans">empty</span>}
                      </td>
                      <td className="px-4 py-2.5"><StatusChip status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
