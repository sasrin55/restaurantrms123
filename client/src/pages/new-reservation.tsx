import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarIcon, Clock, Users, Check, Send, X } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { restaurantTables, tepanyakiSeats } from "@/lib/tables";
import { getTimeSlotsForDate, isMonday, getPeriodLabel, type MealPeriod } from "@/lib/timeSlots";
import restaurantBg from "@/assets/images/restaurant-bg.jpg";

type CustomerMode = "reservation" | "walkin";

export default function NewCustomerPage() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<CustomerMode>("reservation");
  const [confirmed, setConfirmed] = useState(false);

  const [date, setDate] = useState<Date | undefined>(() => {
    const today = new Date();
    if (isMonday(today)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return today;
  });
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [selectedTables, setSelectedTables] = useState<{ id: number; number: string }[]>([]);
  const [selectionMode, setSelectionMode] = useState<"tables" | "tepanyaki">("tables");
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [comments, setComments] = useState("");

  const { data: existingReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations"],
  });

  const parsedSize = parseInt(partySize);

  const effectiveDate = mode === "walkin"
    ? (isMonday(new Date()) ? undefined : new Date())
    : date;

  const bookedTableIds = existingReservations
    .filter((r: any) => {
      if (!effectiveDate) return false;
      const selectedDate = format(effectiveDate, "yyyy-MM-dd");
      return r.date === selectedDate && r.time === time && r.status !== "complete" && r.status !== "cancelled";
    })
    .map((r: any) => r.tableId);

  const createMutation = useMutation({
    mutationFn: async () => {
      const dateStr = effectiveDate ? format(effectiveDate, "yyyy-MM-dd") : "";
      const promises = selectedTables.map((table) => {
        const isTepanyaki = table.id >= 1001 && table.id <= 1008;
        const payload = {
          customerName: mode === "walkin" ? (customerName.trim() || "Walk-in Guest") : customerName,
          phoneNumber: mode === "walkin" ? (phoneNumber.trim() || "N/A") : phoneNumber,
          date: dateStr,
          time,
          partySize: parsedSize,
          tableId: table.id,
          tableName: isTepanyaki ? `Tepanyaki Seat ${table.number}` : `Table ${table.number}`,
          comments: comments.trim(),
          status: mode === "walkin" ? "seated" : "confirmed",
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

  const canSubmit = mode === "reservation"
    ? (!!date && !!time && parsedSize > 0 && selectedTables.length > 0 && !!customerName.trim() && !!phoneNumber.trim())
    : (!!effectiveDate && !!time && parsedSize > 0 && selectedTables.length > 0);

  const handleSubmit = () => {
    if (canSubmit) {
      createMutation.mutate();
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

  const handleDateChange = (d: Date | undefined) => {
    setDate(d);
    setTime("");
    clearSelections();
  };

  const handleModeSwitch = (newMode: CustomerMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setTime("");
    setSelectedTables([]);
    setSelectionMode("tables");
    setConfirmed(false);
  };

  const timeSlots = getTimeSlotsForDate(effectiveDate);
  const groupedSlots = timeSlots.reduce<Record<MealPeriod, typeof timeSlots>>((acc, slot) => {
    if (!acc[slot.period]) acc[slot.period] = [];
    acc[slot.period].push(slot);
    return acc;
  }, {} as Record<MealPeriod, typeof timeSlots>);
  const periodOrder: MealPeriod[] = ["breakfast", "lunch", "iftar", "dinner", "sehri"];

  const toggleTable = (table: { id: number; number: string }) => {
    if (bookedTableIds.includes(table.id)) return;
    const isSelected = selectedTables.some((t) => t.id === table.id);
    if (isSelected) {
      setSelectedTables(selectedTables.filter((t) => t.id !== table.id));
    } else {
      setSelectedTables([...selectedTables, table]);
    }
  };

  const switchTableMode = (tableMode: "tables" | "tepanyaki") => {
    setSelectionMode(tableMode);
    setSelectedTables([]);
  };

  const modePills = (
    <div className="flex gap-2 mb-6" data-testid="mode-pills">
      <Badge
        variant={mode === "reservation" ? "default" : "outline"}
        className={`cursor-pointer px-4 py-1.5 text-sm ${mode === "reservation" ? "bg-[#0D7377] text-white" : ""}`}
        onClick={() => handleModeSwitch("reservation")}
        data-testid="pill-reservation"
      >
        New Reservation
      </Badge>
      <Badge
        variant={mode === "walkin" ? "default" : "outline"}
        className={`cursor-pointer px-4 py-1.5 text-sm ${mode === "walkin" ? "bg-[#0D7377] text-white" : ""}`}
        onClick={() => handleModeSwitch("walkin")}
        data-testid="pill-walkin"
      >
        Walk In
      </Badge>
    </div>
  );

  if (mode === "walkin" && !effectiveDate) {
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
            <h2 className="text-xl font-semibold text-foreground mb-4" data-testid="text-form-title">
              New Customer
            </h2>
            {modePills}
            <p className="text-muted-foreground text-center py-8">Restaurant is closed on Mondays.</p>
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
              <h2 className="text-xl font-semibold text-foreground" data-testid="text-confirmation-title">
                {mode === "walkin" ? "Walk-in Seated" : "Booking Confirmed"}
              </h2>
            </div>
            <p className="text-center text-muted-foreground text-sm mb-6">
              {mode === "walkin"
                ? "The guest has been seated successfully."
                : <>The reservation has been successfully added<br />Please review the details below</>}
            </p>
            <div className="border-t pt-4 space-y-3">
              {(mode === "reservation" || customerName.trim()) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium" data-testid="text-confirm-name">{customerName || "Walk-in Guest"}</span>
                </div>
              )}
              {mode === "reservation" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone Number:</span>
                  <span className="font-medium" data-testid="text-confirm-phone">{phoneNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium" data-testid="text-confirm-date">
                  {effectiveDate ? format(effectiveDate, "dd/MM/yyyy") : ""}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Time:</span>
                  <span className="font-medium" data-testid="text-confirm-time">{time}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Party Size:</span>
                  <span className="font-medium" data-testid="text-confirm-party">
                    {partySize} {parsedSize === 1 ? "person" : "people"}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{selectionMode === "tepanyaki" ? "Seats:" : "Tables:"}</span>
                <span className="font-medium" data-testid="text-confirm-tables">
                  {selectedTables
                    .sort((a, b) => a.id - b.id)
                    .map((t) => t.id >= 1001 && t.id <= 1008 ? `Seat ${t.number}` : `Table ${t.number}`)
                    .join(", ")}
                </span>
              </div>
              {comments.trim() && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comments:</span>
                  <span className="font-medium italic text-right max-w-[200px]" data-testid="text-confirm-comments">{comments}</span>
                </div>
              )}
            </div>
            <div className="mt-6 space-y-3">
              {mode === "reservation" && (
                <Button variant="outline" className="w-full gap-2" data-testid="button-send-confirmation">
                  <Send className="h-4 w-4" />
                  Send Confirmation
                </Button>
              )}
              <Button
                className="w-full bg-[#1C1C1C] text-white"
                onClick={() => navigate("/")}
                data-testid="button-finish"
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
          <h2 className="text-xl font-semibold text-foreground mb-4" data-testid="text-form-title">
            New Customer
          </h2>

          {modePills}

          {mode === "reservation" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-sm">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between text-left font-normal"
                      data-testid="button-date-picker"
                    >
                      {date ? format(date, "dd/MM/yyyy") : "Select date"}
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={handleDateChange}
                      initialFocus
                      disabled={(d) => isMonday(d)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground text-sm">Time</Label>
                <div className="flex items-center gap-2">
                  <Select value={time} onValueChange={handleTimeChange}>
                    <SelectTrigger className="w-full" data-testid="select-time">
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
                    <SelectTrigger className="w-full" data-testid="select-party-size">
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
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-sm">Time</Label>
                <div className="flex items-center gap-2">
                  <Select value={time} onValueChange={handleTimeChange}>
                    <SelectTrigger className="w-full" data-testid="select-time">
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
                    <SelectTrigger className="w-full" data-testid="select-party-size">
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
          )}

          <div className="mb-6">
            <Label className="text-muted-foreground text-sm mb-2 block">Select Seating</Label>

            <div className="flex gap-2 mb-4">
              <Badge
                variant={selectionMode === "tables" ? "default" : "outline"}
                className={`cursor-pointer px-4 py-1.5 text-sm ${selectionMode === "tables" ? "bg-[#0D7377] text-white" : ""}`}
                onClick={() => switchTableMode("tables")}
                data-testid="button-mode-tables"
              >
                Tables
              </Badge>
              <Badge
                variant={selectionMode === "tepanyaki" ? "default" : "outline"}
                className={`cursor-pointer px-4 py-1.5 text-sm ${selectionMode === "tepanyaki" ? "bg-[#0D7377] text-white" : ""}`}
                onClick={() => switchTableMode("tepanyaki")}
                data-testid="button-mode-tepanyaki"
              >
                Tepanyaki Bar
              </Badge>
            </div>

            {selectionMode === "tables" ? (
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
                      data-testid={`table-card-${table.id}`}
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
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  Tepanyaki Bar — 8 seats total. Select the seats for your guest.
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                  {tepanyakiSeats.map((seat) => {
                    const isBooked = bookedTableIds.includes(seat.id);
                    const isSelected = selectedTables.some((t) => t.id === seat.id);
                    return (
                      <div
                        key={seat.id}
                        className={`relative flex flex-col items-center justify-center p-3 rounded-md border transition-colors ${
                          isBooked
                            ? "border-border opacity-50 cursor-not-allowed"
                            : isSelected
                            ? "border-[#0D7377] bg-[#0D7377]/10 cursor-pointer"
                            : "border-border hover-elevate cursor-pointer"
                        }`}
                        onClick={() => toggleTable({ id: seat.id, number: seat.number })}
                        data-testid={`seat-card-${seat.id}`}
                      >
                        {isBooked && (
                          <div className="absolute inset-0 flex items-center justify-center z-10">
                            <X className="h-8 w-8 text-red-400 stroke-[2.5]" />
                          </div>
                        )}
                        <svg width="24" height="28" viewBox="0 0 24 28" fill="none" className="mb-1">
                          <rect x="4" y="10" width="16" height="3" rx="1" fill={isBooked ? "#9CA3AF" : "#0D7377"} />
                          <rect x="6" y="13" width="2" height="10" fill={isBooked ? "#9CA3AF" : "#0D7377"} />
                          <rect x="16" y="13" width="2" height="10" fill={isBooked ? "#9CA3AF" : "#0D7377"} />
                          <path d="M5 10V4C5 2.9 5.9 2 7 2H17C18.1 2 19 2.9 19 4V10" stroke={isBooked ? "#9CA3AF" : "#0D7377"} strokeWidth="1.5" fill="none" />
                        </svg>
                        <span className={`font-medium text-sm ${isBooked ? "text-muted-foreground" : "text-foreground"}`}>Seat {seat.number}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedTables.length > 0 && (
              <p className="text-sm text-[#0D7377] mt-2" data-testid="text-tables-selected">
                {selectionMode === "tepanyaki"
                  ? `${selectedTables.length} seat${selectedTables.length > 1 ? "s" : ""} selected`
                  : `${selectedTables.length} table${selectedTables.length > 1 ? "s" : ""} selected`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">
                Guest Name {mode === "walkin" && <span className="text-xs">(optional)</span>}
              </Label>
              <Input
                placeholder="Full name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">
                Phone Number {mode === "walkin" && <span className="text-xs">(optional)</span>}
              </Label>
              <Input
                placeholder="Phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                data-testid="input-phone-number"
              />
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <Label className="text-muted-foreground text-sm">
              Comments {mode === "walkin" && <span className="text-xs">(optional)</span>}
            </Label>
            <Textarea
              placeholder={mode === "walkin" ? "Any special requests or notes..." : "Any special requests, allergies, or notes..."}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="input-comments"
            />
          </div>

          <Button
            className="w-full bg-[#0D7377] text-white"
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
            data-testid="button-create-reservation"
          >
            {createMutation.isPending
              ? (mode === "walkin" ? "Seating..." : "Creating...")
              : (mode === "walkin" ? "Seat Walk-in" : "Create Reservation")}
          </Button>
        </Card>
      </div>
    </div>
  );
}
