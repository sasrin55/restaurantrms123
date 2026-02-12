import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { Calendar as CalendarIcon, Clock, Users, Check, Send } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import restaurantBg from "@/assets/images/restaurant-bg.jpg";

const availableTimes = [
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
  "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM",
  "9:00 PM", "9:30 PM", "10:00 PM",
];

const restaurantTables = [
  { id: 1, number: 1, minCapacity: 4, maxCapacity: 6 },
  { id: 2, number: 2, minCapacity: 4, maxCapacity: 6 },
  { id: 3, number: 3, minCapacity: 2, maxCapacity: 2 },
  { id: 4, number: 4, minCapacity: 2, maxCapacity: 2 },
  { id: 5, number: 5, minCapacity: 8, maxCapacity: 10 },
  { id: 6, number: 6, minCapacity: 3, maxCapacity: 3 },
  { id: 7, number: 7, minCapacity: 4, maxCapacity: 4 },
  { id: 8, number: 8, minCapacity: 2, maxCapacity: 2 },
  { id: 9, number: 9, minCapacity: 2, maxCapacity: 2 },
  { id: 10, number: 10, minCapacity: 2, maxCapacity: 2 },
  { id: 11, number: 11, minCapacity: 8, maxCapacity: 10 },
  { id: 12, number: 12, minCapacity: 3, maxCapacity: 4 },
  { id: 13, number: 13, minCapacity: 3, maxCapacity: 4 },
  { id: 14, number: 14, minCapacity: 4, maxCapacity: 6 },
];

export default function NewReservationPage() {
  const [, navigate] = useLocation();
  const [confirmed, setConfirmed] = useState(false);

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState("7:00 PM");
  const [partySize, setPartySize] = useState("2");
  const [selectedTables, setSelectedTables] = useState<{ id: number; number: number }[]>([]);
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

  const availableTables = restaurantTables.filter(
    (t) =>
      parsedSize >= t.minCapacity &&
      parsedSize <= t.maxCapacity &&
      !bookedTableIds.includes(t.id)
  );

  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const dateStr = date ? format(date, "yyyy-MM-dd") : "";
      const promises = selectedTables.map((table) => {
        const payload = {
          customerName,
          phoneNumber,
          date: dateStr,
          time,
          partySize: parsedSize,
          tableId: table.id,
          tableName: `Table ${table.number}`,
          comments: comments.trim(),
          status: "confirmed",
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
    selectedTables.length > 0 &&
    !!customerName.trim() &&
    !!phoneNumber.trim();

  const handleSubmit = () => {
    if (canSubmit) {
      createReservationMutation.mutate();
    }
  };

  const handlePartySizeChange = (val: string) => {
    setPartySize(val);
    setSelectedTables([]);
  };

  const handleTimeChange = (val: string) => {
    setTime(val);
    setSelectedTables([]);
  };

  const handleDateChange = (d: Date | undefined) => {
    setDate(d);
    setSelectedTables([]);
  };

  const toggleTable = (table: { id: number; number: number }) => {
    const isSelected = selectedTables.some((t) => t.id === table.id);
    if (isSelected) {
      setSelectedTables(selectedTables.filter((t) => t.id !== table.id));
    } else {
      setSelectedTables([...selectedTables, table]);
    }
  };

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
                Booking Confirmed
              </h2>
            </div>
            <p className="text-center text-muted-foreground text-sm mb-6">
              The reservation has been successfully added
              <br />
              Please review the details below
            </p>
            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium" data-testid="text-confirm-name">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone Number:</span>
                <span className="font-medium" data-testid="text-confirm-phone">{phoneNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium" data-testid="text-confirm-date">
                  {date ? format(date, "dd/MM/yyyy") : ""}
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
                <span className="text-muted-foreground">Tables:</span>
                <span className="font-medium" data-testid="text-confirm-tables">
                  {selectedTables
                    .sort((a, b) => a.number - b.number)
                    .map((t) => `Table ${t.number}`)
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
              <Button variant="outline" className="w-full gap-2" data-testid="button-send-confirmation">
                <Send className="h-4 w-4" />
                Send Confirmation
              </Button>
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
          <h2 className="text-xl font-semibold text-foreground mb-6" data-testid="text-form-title">
            New Reservation
          </h2>

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
                  <Calendar mode="single" selected={date} onSelect={handleDateChange} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Time</Label>
              <div className="flex items-center gap-2">
                <Select value={time} onValueChange={handleTimeChange}>
                  <SelectTrigger className="w-full" data-testid="select-time">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTimes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
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
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((size) => (
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
            {availableTables.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center" data-testid="text-no-tables">
                No tables available for this party size, date, and time.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {availableTables.map((table) => {
                  const isSelected = selectedTables.some((t) => t.id === table.id);
                  return (
                    <div
                      key={table.id}
                      className={`flex flex-col items-center justify-center p-3 rounded-md cursor-pointer border transition-colors ${
                        isSelected
                          ? "border-[#0D7377] bg-[#0D7377]/10"
                          : "border-border hover-elevate"
                      }`}
                      onClick={() => toggleTable({ id: table.id, number: table.number })}
                      data-testid={`table-card-${table.id}`}
                    >
                      <svg width="36" height="24" viewBox="0 0 48 32" fill="none" className="mb-1">
                        <rect x="8" y="12" width="32" height="4" fill="#0D7377" rx="1" />
                        <rect x="10" y="16" width="2" height="12" fill="#0D7377" />
                        <rect x="36" y="16" width="2" height="12" fill="#0D7377" />
                        <rect x="2" y="8" width="8" height="16" rx="2" stroke="#0D7377" strokeWidth="1.5" fill="none" />
                        <rect x="38" y="8" width="8" height="16" rx="2" stroke="#0D7377" strokeWidth="1.5" fill="none" />
                      </svg>
                      <span className="font-medium text-sm text-foreground">Table {table.number}</span>
                      <span className="text-xs text-muted-foreground">
                        {table.minCapacity === table.maxCapacity
                          ? `${table.minCapacity} seats`
                          : `${table.minCapacity}-${table.maxCapacity}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {selectedTables.length > 0 && (
              <p className="text-sm text-[#0D7377] mt-2" data-testid="text-tables-selected">
                {selectedTables.length} table{selectedTables.length > 1 ? "s" : ""} selected
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Guest Name</Label>
              <Input
                placeholder="Full name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">Phone Number</Label>
              <Input
                placeholder="Phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                data-testid="input-phone-number"
              />
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <Label className="text-muted-foreground text-sm">Comments</Label>
            <Textarea
              placeholder="Any special requests, allergies, or notes..."
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
            disabled={!canSubmit || createReservationMutation.isPending}
            data-testid="button-create-reservation"
          >
            {createReservationMutation.isPending ? "Creating..." : "Create Reservation"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
