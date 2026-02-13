import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Users, Check, Link2, X } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { restaurantTables } from "@/lib/tables";
import { getTimeSlotsForDate, isMonday, getPeriodLabel, type MealPeriod } from "@/lib/timeSlots";
import restaurantBg from "@/assets/images/restaurant-bg.jpg";

export default function WalkInPage() {
  const [, navigate] = useLocation();
  const [confirmed, setConfirmed] = useState(false);

  const today = new Date();
  const date = isMonday(today) ? undefined : today;

  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [selectedTables, setSelectedTables] = useState<{ id: number; number: string }[]>([]);
  const [selectionMode, setSelectionMode] = useState<"single" | "join">("single");
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [comments, setComments] = useState("");

  const { data: existingReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations"],
  });

  const parsedSize = parseInt(partySize);

  const bookedTableIds = existingReservations
    .filter((r: any) => {
      if (!date) return false;
      const selectedDate = format(date, "yyyy-MM-dd");
      return r.date === selectedDate && r.time === time && r.status !== "complete" && r.status !== "cancelled";
    })
    .map((r: any) => r.tableId);

  const createWalkInMutation = useMutation({
    mutationFn: async () => {
      const dateStr = date ? format(date, "yyyy-MM-dd") : "";
      const promises = selectedTables.map((table) => {
        const payload = {
          customerName: customerName.trim() || "Walk-in Guest",
          phoneNumber: phoneNumber.trim() || "N/A",
          date: dateStr,
          time,
          partySize: parsedSize,
          tableId: table.id,
          tableName: `Table ${table.number}`,
          comments: comments.trim(),
          status: "seated",
        };
        return apiRequest("POST", "/api/reservations", payload);
      });
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      setConfirmed(true);
    },
  });

  const canSubmit =
    !!date &&
    !!time &&
    parsedSize > 0 &&
    selectedTables.length > 0;

  const handleSubmit = () => {
    if (canSubmit) {
      createWalkInMutation.mutate();
    }
  };

  const clearSelections = () => {
    setSelectedTables([]);
  };

  const handlePartySizeChange = (val: string) => {
    setPartySize(val);
    clearSelections();
  };

  const handleTimeChange = (val: string) => {
    setTime(val);
    clearSelections();
  };

  const timeSlots = getTimeSlotsForDate(date);
  const groupedSlots = timeSlots.reduce<Record<MealPeriod, typeof timeSlots>>((acc, slot) => {
    if (!acc[slot.period]) acc[slot.period] = [];
    acc[slot.period].push(slot);
    return acc;
  }, {} as Record<MealPeriod, typeof timeSlots>);
  const periodOrder: MealPeriod[] = ["breakfast", "lunch", "dinner"];

  const toggleTable = (table: { id: number; number: string }) => {
    if (bookedTableIds.includes(table.id)) return;
    const isSelected = selectedTables.some((t) => t.id === table.id);
    if (isSelected) {
      setSelectedTables(selectedTables.filter((t) => t.id !== table.id));
    } else {
      if (selectionMode === "single") {
        setSelectedTables([table]);
      } else {
        if (selectedTables.length >= 2) {
          setSelectedTables([selectedTables[1], table]);
        } else {
          setSelectedTables([...selectedTables, table]);
        }
      }
    }
  };

  const switchMode = (mode: "single" | "join") => {
    setSelectionMode(mode);
    setSelectedTables([]);
  };

  if (!date) {
    return (
      <div
        className="flex-1 h-full bg-cover bg-center bg-no-repeat relative overflow-auto"
        style={{ backgroundImage: `url(${restaurantBg})` }}
      >
        <div className="absolute inset-0 bg-white/40" />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-full py-8 px-4">
          <Card className="p-6 bg-white/95 shadow-lg max-w-md w-full text-center">
            <p className="text-muted-foreground">Restaurant is closed on Mondays.</p>
          </Card>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div
        className="flex-1 h-full bg-cover bg-center bg-no-repeat relative overflow-auto"
        style={{ backgroundImage: `url(${restaurantBg})` }}
      >
        <div className="absolute inset-0 bg-white/40" />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-full py-8 px-4">
          <h1
            className="mb-8"
            style={{
              fontFamily: "'Ortica Linear', 'Playfair Display', serif",
              fontWeight: 300,
              fontSize: "40px",
              lineHeight: "100%",
              color: "#0D7377",
            }}
            data-testid="text-brand-title"
          >
            seated
          </h1>
          <Card className="p-6 bg-white/95 shadow-lg max-w-md w-full">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-foreground" data-testid="text-walkin-confirmation">
                Walk-in Seated
              </h2>
            </div>
            <p className="text-center text-muted-foreground text-sm mb-6">
              The guest has been seated successfully.
            </p>
            <div className="border-t pt-4 space-y-3">
              {customerName.trim() && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium" data-testid="text-walkin-name">{customerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium" data-testid="text-walkin-date">
                  {format(date, "dd/MM/yyyy")}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Time:</span>
                  <span className="font-medium" data-testid="text-walkin-time">{time}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Party Size:</span>
                  <span className="font-medium" data-testid="text-walkin-party">
                    {partySize} {parsedSize === 1 ? "person" : "people"}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tables:</span>
                <span className="font-medium" data-testid="text-walkin-tables">
                  {selectedTables
                    .sort((a, b) => a.id - b.id)
                    .map((t) => `Table ${t.number}`)
                    .join(", ")}
                </span>
              </div>
            </div>
            <div className="mt-6">
              <Button
                className="w-full bg-[#1C1C1C] text-white"
                onClick={() => navigate("/")}
                data-testid="button-walkin-finish"
              >
                Finish
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 h-full bg-cover bg-center bg-no-repeat relative overflow-auto"
      style={{ backgroundImage: `url(${restaurantBg})` }}
    >
      <div className="absolute inset-0 bg-white/40" />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-full py-8 px-4">
        <h1
          className="mb-6"
          style={{
            fontFamily: "'Ortica Linear', 'Playfair Display', serif",
            fontWeight: 300,
            fontSize: "40px",
            lineHeight: "100%",
            color: "#0D7377",
          }}
          data-testid="text-brand-title"
        >
          seated
        </h1>

        <Card className="bg-white/95 shadow-lg w-full max-w-3xl p-8">
          <h2 className="text-xl font-semibold text-foreground mb-6" data-testid="text-walkin-title">
            Walk In
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Time</Label>
              <div className="flex items-center gap-2">
                <Select value={time} onValueChange={handleTimeChange}>
                  <SelectTrigger className="w-full" data-testid="walkin-select-time">
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">Closed on Mondays</div>
                    ) : (
                      periodOrder.filter(p => groupedSlots[p]).map((period) => (
                        <div key={period}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{getPeriodLabel(period)}</div>
                          {groupedSlots[period].map((slot) => (
                            <SelectItem key={slot.label} value={slot.label}>
                              {slot.label}
                            </SelectItem>
                          ))}
                        </div>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Party Size</Label>
              <div className="flex items-center gap-2">
                <Select value={partySize} onValueChange={handlePartySizeChange}>
                  <SelectTrigger className="w-full" data-testid="walkin-select-party-size">
                    <SelectValue placeholder="Party size" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size} {size === 1 ? "person" : "people"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Users className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </div>
          </div>

          <div className="mb-6">
            <Label className="text-muted-foreground text-sm mb-2 block">Select Table(s)</Label>

            <div className="flex gap-2 mb-4">
              <Button
                type="button"
                variant={selectionMode === "single" ? "default" : "outline"}
                size="sm"
                onClick={() => switchMode("single")}
                className={selectionMode === "single" ? "bg-[#0D7377]" : ""}
                data-testid="walkin-button-mode-single"
              >
                Single Table
              </Button>
              <Button
                type="button"
                variant={selectionMode === "join" ? "default" : "outline"}
                size="sm"
                onClick={() => switchMode("join")}
                className={selectionMode === "join" ? "bg-[#0D7377]" : ""}
                data-testid="walkin-button-mode-join"
              >
                <Link2 className="h-3.5 w-3.5 mr-1" />
                Join Two Tables
              </Button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {restaurantTables.map((table) => {
                const isBooked = bookedTableIds.includes(table.id);
                const isSelected = selectedTables.some((t) => t.id === table.id);
                return (
                  <div
                    key={table.id}
                    className={`relative flex flex-col items-center justify-center p-3 rounded-md border transition-colors ${
                      isBooked
                        ? "border-border opacity-50 cursor-not-allowed"
                        : isSelected
                        ? "border-[#0D7377] bg-[#0D7377]/10 cursor-pointer"
                        : "border-border hover-elevate cursor-pointer"
                    }`}
                    onClick={() => toggleTable({ id: table.id, number: table.number })}
                    data-testid={`walkin-table-card-${table.id}`}
                  >
                    {isBooked && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <X className="h-10 w-10 text-red-400 stroke-[2.5]" />
                      </div>
                    )}
                    <svg width="36" height="24" viewBox="0 0 48 32" fill="none" className="mb-1">
                      <rect x="8" y="12" width="32" height="4" fill={isBooked ? "#9CA3AF" : "#0D7377"} rx="1" />
                      <rect x="10" y="16" width="2" height="12" fill={isBooked ? "#9CA3AF" : "#0D7377"} />
                      <rect x="36" y="16" width="2" height="12" fill={isBooked ? "#9CA3AF" : "#0D7377"} />
                      <rect x="2" y="8" width="8" height="16" rx="2" stroke={isBooked ? "#9CA3AF" : "#0D7377"} strokeWidth="1.5" fill="none" />
                      <rect x="38" y="8" width="8" height="16" rx="2" stroke={isBooked ? "#9CA3AF" : "#0D7377"} strokeWidth="1.5" fill="none" />
                    </svg>
                    <span className={`font-medium text-sm ${isBooked ? "text-muted-foreground" : "text-foreground"}`}>Table {table.number}</span>
                    <span className="text-xs text-muted-foreground">
                      {table.minCapacity === table.maxCapacity
                        ? `${table.minCapacity} seats`
                        : `${table.minCapacity}-${table.maxCapacity}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {selectedTables.length > 0 && (
              <p className="text-sm text-[#0D7377] mt-2" data-testid="walkin-text-tables-selected">
                {selectionMode === "join" && selectedTables.length === 2
                  ? `Tables ${selectedTables[0].number} + ${selectedTables[1].number} joined`
                  : selectionMode === "join" && selectedTables.length === 1
                  ? `1 table selected — pick one more to join`
                  : `${selectedTables.length} table${selectedTables.length > 1 ? "s" : ""} selected`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Guest Name <span className="text-xs">(optional)</span></Label>
              <Input
                placeholder="Full name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="walkin-input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Phone Number <span className="text-xs">(optional)</span></Label>
              <Input
                placeholder="Phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                data-testid="walkin-input-phone-number"
              />
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <Label className="text-muted-foreground text-sm">Comments <span className="text-xs">(optional)</span></Label>
            <Textarea
              placeholder="Any special requests or notes..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="walkin-input-comments"
            />
          </div>

          <Button
            className="w-full bg-[#0D7377] text-white"
            onClick={handleSubmit}
            disabled={!canSubmit || createWalkInMutation.isPending}
            data-testid="button-create-walkin"
          >
            {createWalkInMutation.isPending ? "Seating..." : "Seat Walk-in"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
