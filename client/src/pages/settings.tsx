import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import type { Reservation } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  booked: "bg-blue-500 text-white",
  confirmed: "bg-green-600 text-white",
  seated: "bg-[#4A5D23] text-white",
  complete: "bg-gray-500 text-white",
  cancelled: "bg-rose-500 text-white",
  "no-show": "bg-orange-500 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  seated: "Seated",
  complete: "Complete",
  cancelled: "Cancelled",
  "no-show": "No Show",
};

function formatCreatedAt(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "h:mm a")}`;
  return format(d, "EEE d MMM, h:mm a");
}

type DateRange = "today" | "7days" | "30days" | "all";

export default function SettingsPage() {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("7days");

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoffs: Record<DateRange, number> = {
      today: now - 24 * 60 * 60 * 1000,
      "7days": now - 7 * 24 * 60 * 60 * 1000,
      "30days": now - 30 * 24 * 60 * 60 * 1000,
      all: 0,
    };
    const cutoff = cutoffs[range];

    return reservations
      .filter((r) => {
        const ts = r.createdAt ? new Date(r.createdAt).getTime() : 0;
        if (ts < cutoff) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          r.customerName.toLowerCase().includes(q) ||
          r.phoneNumber.toLowerCase().includes(q) ||
          r.tableName?.toLowerCase().includes(q) ||
          r.takenBy?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [reservations, search, range]);

  const rangeOptions: { label: string; value: DateRange }[] = [
    { label: "Today", value: "today" },
    { label: "Last 7 days", value: "7days" },
    { label: "Last 30 days", value: "30days" },
    { label: "All time", value: "all" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reservation Log</h1>
        <p className="text-muted-foreground text-sm mt-1">
          A full history of every reservation and when it was taken.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, table, or server…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-log-search"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {rangeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                range === opt.value
                  ? "bg-[#0D7377] text-white border-[#0D7377]"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
              }`}
              data-testid={`button-range-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No reservations found for this period.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 text-xs font-medium text-muted-foreground grid grid-cols-[1fr_1fr_80px_1fr_1fr_100px] gap-x-3 px-4 py-2.5 border-b">
            <span>Guest</span>
            <span>Reservation</span>
            <span>Pax</span>
            <span>Table</span>
            <span>Taken by</span>
            <span>Booked at</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_1fr_80px_1fr_1fr_100px] gap-x-3 items-center px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                data-testid={`log-row-${r.id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{r.customerName}</p>
                  <p className="text-muted-foreground text-xs truncate">{r.phoneNumber}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-foreground truncate">
                    {r.date ? format(parseISO(r.date), "EEE d MMM") : "—"}
                  </p>
                  <p className="text-muted-foreground text-xs truncate">{r.time}</p>
                </div>
                <div>
                  <span className="text-foreground">{r.partySize}</span>
                </div>
                <div className="text-muted-foreground truncate">{r.tableName}</div>
                <div className="text-muted-foreground truncate">{r.takenBy || "—"}</div>
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${STATUS_COLORS[r.status] ?? "bg-gray-200 text-gray-700"}`}
                    data-testid={`log-status-${r.id}`}
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  <p className="text-muted-foreground text-[11px] mt-0.5 whitespace-nowrap">
                    {formatCreatedAt(r.createdAt as any)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2.5 bg-muted/30 border-t text-xs text-muted-foreground">
            Showing {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </div>
        </div>
      )}
    </div>
  );
}
