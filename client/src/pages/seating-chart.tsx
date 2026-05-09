import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import type { Reservation } from "@shared/schema";
import floorPlanBg from "@assets/replit_1770894017909.JPG";
import { formatName } from "@/lib/utils";

interface TablePosition {
  id: number;
  number: number;
  x: number;
  y: number;
  minCapacity: number;
  maxCapacity: number;
  shape: "round" | "rect";
}

const STORAGE_KEY = "seating-chart-positions";

const defaultTables: TablePosition[] = [
  { id: 1, number: 1, x: 58, y: 82, minCapacity: 4, maxCapacity: 6, shape: "round" },
  { id: 2, number: 2, x: 45, y: 82, minCapacity: 4, maxCapacity: 6, shape: "round" },
  { id: 3, number: 3, x: 38, y: 62, minCapacity: 2, maxCapacity: 2, shape: "round" },
  { id: 4, number: 4, x: 28, y: 62, minCapacity: 2, maxCapacity: 2, shape: "round" },
  { id: 5, number: 5, x: 14, y: 52, minCapacity: 8, maxCapacity: 10, shape: "rect" },
  { id: 6, number: 6, x: 8, y: 28, minCapacity: 3, maxCapacity: 3, shape: "round" },
  { id: 7, number: 7, x: 8, y: 12, minCapacity: 4, maxCapacity: 4, shape: "round" },
  { id: 8, number: 8, x: 22, y: 52, minCapacity: 2, maxCapacity: 2, shape: "round" },
  { id: 9, number: 9, x: 50, y: 22, minCapacity: 2, maxCapacity: 2, shape: "round" },
  { id: 10, number: 10, x: 50, y: 42, minCapacity: 2, maxCapacity: 2, shape: "round" },
  { id: 11, number: 11, x: 72, y: 68, minCapacity: 8, maxCapacity: 10, shape: "rect" },
  { id: 12, number: 12, x: 68, y: 48, minCapacity: 3, maxCapacity: 4, shape: "round" },
  { id: 13, number: 13, x: 78, y: 48, minCapacity: 3, maxCapacity: 4, shape: "round" },
  { id: 14, number: 14, x: 72, y: 30, minCapacity: 4, maxCapacity: 6, shape: "round" },
];

function loadPositions(): TablePosition[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as TablePosition[];
      if (parsed.length === defaultTables.length) return parsed;
    }
  } catch {}
  return defaultTables;
}

function savePositions(tables: TablePosition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tables));
}

export default function SeatingChartPage() {
  const [tables, setTables] = useState<TablePosition[]>(loadPositions);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const todayReservations = reservations.filter(
    (r) => r.date === todayStr && r.status !== "cancelled" && r.status !== "complete"
  );

  const getTableReservation = (tableId: number) =>
    todayReservations.find((r) => r.tableId === tableId);

  const getTableStatus = (tableId: number) => {
    const res = getTableReservation(tableId);
    if (!res) return "available";
    if (res.status === "seated") return "seated";
    return "reserved";
  };

  const statusColors: Record<string, { bg: string; border: string; text: string }> = {
    available: { bg: "#E8F5E9", border: "#4CAF50", text: "#2E7D32" },
    reserved: { bg: "#E3F2FD", border: "#0D7377", text: "#0D7377" },
    seated: { bg: "#FFF3E0", border: "#F57C00", text: "#E65100" },
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tableId: number) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const table = tables.find((t) => t.id === tableId);
      if (!table) return;
      const tablePixelX = (table.x / 100) * rect.width;
      const tablePixelY = (table.y / 100) * rect.height;
      setDragOffset({
        x: e.clientX - rect.left - tablePixelX,
        y: e.clientY - rect.top - tablePixelY,
      });
      setDragging(tableId);
    },
    [tables]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, tableId: number) => {
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const table = tables.find((t) => t.id === tableId);
      if (!table) return;
      const touch = e.touches[0];
      const tablePixelX = (table.x / 100) * rect.width;
      const tablePixelY = (table.y / 100) * rect.height;
      setDragOffset({
        x: touch.clientX - rect.left - tablePixelX,
        y: touch.clientY - rect.top - tablePixelY,
      });
      setDragging(tableId);
    },
    [tables]
  );

  useEffect(() => {
    if (dragging === null) return;

    const handleMove = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = ((clientX - rect.left - dragOffset.x) / rect.width) * 100;
      const y = ((clientY - rect.top - dragOffset.y) / rect.height) * 100;
      const clampedX = Math.max(2, Math.min(95, x));
      const clampedY = Math.max(2, Math.min(95, y));
      setTables((prev) =>
        prev.map((t) => (t.id === dragging ? { ...t, x: clampedX, y: clampedY } : t))
      );
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onEnd = () => {
      setDragging(null);
      setTables((prev) => {
        savePositions(prev);
        return prev;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [dragging, dragOffset]);

  const handleResetLayout = () => {
    setTables(defaultTables);
    savePositions(defaultTables);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-xl font-semibold text-foreground" data-testid="text-seating-title">
            Seating Chart
          </h1>
          <p className="text-sm text-muted-foreground">
            Drag tables to rearrange. Today's reservations shown.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#4CAF50" }} />
              <span className="text-xs text-muted-foreground">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#0D7377" }} />
              <span className="text-xs text-muted-foreground">Reserved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#F57C00" }} />
              <span className="text-xs text-muted-foreground">Seated</span>
            </div>
          </div>
          <button
            onClick={handleResetLayout}
            className="text-xs text-muted-foreground underline"
            data-testid="button-reset-layout"
          >
            Reset Layout
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative p-4">
          <div
            ref={containerRef}
            className="relative w-full h-full rounded-md border-2 border-dashed border-border overflow-hidden"
            style={{ backgroundColor: "#FAFAF8", cursor: dragging ? "grabbing" : "default" }}
            data-testid="seating-chart-canvas"
          >
            <div
              className="absolute border border-muted-foreground/30 rounded-sm flex items-center justify-center"
              style={{ left: "2%", top: "2%", width: "14%", height: "10%" }}
            >
              <span className="text-xs text-muted-foreground font-medium">Toilet</span>
            </div>

            <div
              className="absolute border-2 border-muted-foreground/30 rounded-sm flex items-center justify-center"
              style={{ left: "60%", top: "2%", width: "22%", height: "22%" }}
            >
              <span className="text-sm text-muted-foreground font-medium">Museum</span>
            </div>

            <div
              className="absolute flex items-center justify-center"
              style={{ left: "85%", top: "78%", width: "12%", height: "10%" }}
            >
              <div className="flex flex-col items-center">
                <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                  <path d="M2 14 L10 2 L18 14 Z" stroke="currentColor" strokeWidth="1.5" fill="none" className="text-muted-foreground/50" />
                </svg>
                <span className="text-xs text-muted-foreground font-medium mt-0.5">Entrance</span>
              </div>
            </div>

            <div
              className="absolute border border-muted-foreground/30 rounded-sm flex items-center justify-center"
              style={{ left: "2%", top: "88%", width: "18%", height: "10%" }}
            >
              <span className="text-xs text-muted-foreground font-medium">Teppanyaki</span>
            </div>

            <div className="absolute flex flex-col items-center" style={{ left: "33%", top: "72%" }}>
              <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
                <circle cx="9" cy="7" r="6" stroke="#6B8E23" strokeWidth="1.5" fill="#6B8E23" fillOpacity="0.15" />
                <rect x="8" y="13" width="2" height="7" fill="#8B7355" />
              </svg>
              <span className="text-[10px] text-muted-foreground mt-0.5">Tree</span>
            </div>
            <div className="absolute flex flex-col items-center" style={{ left: "33%", top: "82%" }}>
              <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
                <circle cx="9" cy="7" r="6" stroke="#6B8E23" strokeWidth="1.5" fill="#6B8E23" fillOpacity="0.15" />
                <rect x="8" y="13" width="2" height="7" fill="#8B7355" />
              </svg>
              <span className="text-[10px] text-muted-foreground mt-0.5">Tree</span>
            </div>

            {tables.map((table) => {
              const status = getTableStatus(table.id);
              const colors = statusColors[status];
              const reservation = getTableReservation(table.id);
              const isLarge = table.shape === "rect";
              const size = isLarge ? { width: 80, height: 50 } : { width: 56, height: 56 };

              return (
                <div
                  key={table.id}
                  className="absolute flex flex-col items-center select-none"
                  style={{
                    left: `${table.x}%`,
                    top: `${table.y}%`,
                    transform: "translate(-50%, -50%)",
                    zIndex: dragging === table.id ? 50 : 10,
                    cursor: dragging === table.id ? "grabbing" : "grab",
                  }}
                  onMouseDown={(e) => handleMouseDown(e, table.id)}
                  onTouchStart={(e) => handleTouchStart(e, table.id)}
                  onClick={() => setSelectedTable(selectedTable === table.id ? null : table.id)}
                  data-testid={`seating-table-${table.id}`}
                >
                  <div
                    className="flex flex-col items-center justify-center transition-shadow"
                    style={{
                      width: size.width,
                      height: size.height,
                      backgroundColor: colors.bg,
                      border: `2px solid ${colors.border}`,
                      borderRadius: isLarge ? 8 : "50%",
                      boxShadow:
                        dragging === table.id
                          ? "0 8px 24px rgba(0,0,0,0.2)"
                          : selectedTable === table.id
                          ? `0 0 0 3px ${colors.border}40`
                          : "0 2px 6px rgba(0,0,0,0.08)",
                    }}
                  >
                    <span
                      className="font-bold text-xs leading-none"
                      style={{ color: colors.text }}
                    >
                      T{table.number}
                    </span>
                    <span
                      className="text-[9px] leading-none mt-0.5"
                      style={{ color: colors.text, opacity: 0.7 }}
                    >
                      {table.minCapacity === table.maxCapacity
                        ? `${table.minCapacity}`
                        : `${table.minCapacity}-${table.maxCapacity}`}
                    </span>
                  </div>
                  {reservation && (
                    <div
                      className="absolute -bottom-4 whitespace-nowrap text-[9px] font-medium px-1 rounded"
                      style={{
                        backgroundColor: colors.border,
                        color: "white",
                      }}
                    >
                      {formatName(reservation.customerName).split(" ")[0]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {selectedTable && (
          <div className="w-64 border-l p-4 overflow-auto" data-testid="panel-table-details">
            {(() => {
              const table = tables.find((t) => t.id === selectedTable);
              if (!table) return null;
              const reservation = getTableReservation(table.id);
              const status = getTableStatus(table.id);
              const colors = statusColors[status];
              return (
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Table {table.number}</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {table.minCapacity === table.maxCapacity
                      ? `${table.minCapacity} seats`
                      : `${table.minCapacity}-${table.maxCapacity} seats`}
                  </p>
                  <div
                    className="inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-4"
                    style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </div>
                  {reservation ? (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Guest: </span>
                        <span className="text-foreground font-medium">{formatName(reservation.customerName)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Time: </span>
                        <span className="text-foreground">{reservation.time}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Party: </span>
                        <span className="text-foreground">{reservation.partySize} people</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phone: </span>
                        <span className="text-foreground">{reservation.phoneNumber}</span>
                      </div>
                      {reservation.comments && (
                        <div>
                          <span className="text-muted-foreground">Notes: </span>
                          <span className="text-foreground italic">{reservation.comments}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No reservation for today.</p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
