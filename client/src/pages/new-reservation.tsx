import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Users, Check, Send } from "lucide-react";
import { format } from "date-fns";
import restaurantBg from "@/assets/images/restaurant-bg.jpg";

interface ReservationData {
  date: Date | undefined;
  time: string;
  partySize: number;
  tableNumber: string;
  customerName: string;
  phoneNumber: string;
}

const availableTimes = [
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
  "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM",
  "9:00 PM", "9:30 PM", "10:00 PM"
];

const mockTables = [
  { id: "1", number: "1", capacity: 4 },
  { id: "4", number: "4", capacity: 4 },
  { id: "9", number: "9", capacity: 4 },
  { id: "12", number: "12", capacity: 4 },
  { id: "15", number: "15", capacity: 4 },
  { id: "16", number: "16", capacity: 4 },
];

export default function NewReservationPage() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [reservationData, setReservationData] = useState<ReservationData>({
    date: new Date(),
    time: "4:00 PM",
    partySize: 4,
    tableNumber: "",
    customerName: "",
    phoneNumber: "",
  });

  const totalSteps = 6;

  const canGoNext = () => {
    switch (currentStep) {
      case 1: return !!reservationData.date;
      case 2: return !!reservationData.time;
      case 3: return reservationData.partySize > 0;
      case 4: return !!reservationData.tableNumber;
      case 5: return !!reservationData.customerName && !!reservationData.phoneNumber;
      default: return true;
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps && canGoNext()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = () => {
    navigate("/");
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="flex flex-col items-center">
            <h2 className="text-xl font-medium text-foreground mb-6" data-testid="text-step-title">
              What date does the customer want a booking?
            </h2>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[200px] justify-between text-left font-normal bg-white"
                  data-testid="button-date-picker"
                >
                  {reservationData.date ? format(reservationData.date, "dd/MM/yyyy") : "Select date"}
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={reservationData.date}
                  onSelect={(date) => setReservationData({ ...reservationData, date })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col items-center">
            <h2 className="text-xl font-medium text-foreground mb-6" data-testid="text-step-title">
              What time does the customer want a booking for?
            </h2>
            <Select 
              value={reservationData.time} 
              onValueChange={(time) => setReservationData({ ...reservationData, time })}
            >
              <SelectTrigger className="w-[200px] bg-white" data-testid="select-time">
                <SelectValue placeholder="Select time" />
                <Clock className="h-4 w-4 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent>
                {availableTimes.map((time) => (
                  <SelectItem key={time} value={time}>{time}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col items-center">
            <h2 className="text-xl font-medium text-foreground mb-6" data-testid="text-step-title">
              What is the party size?
            </h2>
            <Select 
              value={reservationData.partySize.toString()} 
              onValueChange={(size) => setReservationData({ ...reservationData, partySize: parseInt(size) })}
            >
              <SelectTrigger className="w-[200px] bg-white" data-testid="select-party-size">
                <SelectValue placeholder="Select party size" />
                <Users className="h-4 w-4 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size} {size === 1 ? "person" : "people"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col items-center">
            <h2 className="text-xl font-medium text-foreground mb-6" data-testid="text-step-title">
              Available Tables
            </h2>
            <div className="grid grid-cols-4 gap-4">
              {mockTables.filter(t => t.capacity >= reservationData.partySize).map((table) => (
                <Card
                  key={table.id}
                  className={`p-4 cursor-pointer transition-all flex flex-col items-center justify-center min-w-[100px] ${
                    reservationData.tableNumber === table.number
                      ? "ring-2 ring-[#0D7377] bg-[#0D7377]/5"
                      : "bg-white/90"
                  }`}
                  onClick={() => setReservationData({ ...reservationData, tableNumber: table.number })}
                  data-testid={`table-card-${table.id}`}
                >
                  <svg width="48" height="32" viewBox="0 0 48 32" fill="none" className="mb-2">
                    <rect x="8" y="12" width="32" height="4" fill="#0D7377" rx="1" />
                    <rect x="10" y="16" width="2" height="12" fill="#0D7377" />
                    <rect x="36" y="16" width="2" height="12" fill="#0D7377" />
                    <rect x="2" y="8" width="8" height="16" rx="2" stroke="#0D7377" strokeWidth="1.5" fill="none" />
                    <rect x="38" y="8" width="8" height="16" rx="2" stroke="#0D7377" strokeWidth="1.5" fill="none" />
                  </svg>
                  <span className="font-medium text-foreground">Table {table.number}</span>
                  <span className="text-xs text-muted-foreground">{table.capacity} people</span>
                </Card>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="flex flex-col items-center">
            <h2 className="text-xl font-medium text-foreground mb-6" data-testid="text-step-title">
              Customer Details
            </h2>
            <div className="flex gap-4">
              <Input
                placeholder="Name"
                value={reservationData.customerName}
                onChange={(e) => setReservationData({ ...reservationData, customerName: e.target.value })}
                className="w-[180px] bg-white"
                data-testid="input-customer-name"
              />
              <Input
                placeholder="Phone Number"
                value={reservationData.phoneNumber}
                onChange={(e) => setReservationData({ ...reservationData, phoneNumber: e.target.value })}
                className="w-[180px] bg-white"
                data-testid="input-phone-number"
              />
            </div>
          </div>
        );

      case 6:
        return (
          <div className="flex flex-col items-center">
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
                The reservation has been successfully added<br />
                Please review the details below
              </p>
              
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{reservationData.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone Number:</span>
                  <span className="font-medium">{reservationData.phoneNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">
                    {reservationData.date ? format(reservationData.date, "dd/MM/yyyy") : ""}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Time:</span>
                    <span className="font-medium">{reservationData.time}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Party Size:</span>
                    <span className="font-medium">{reservationData.partySize} people</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  data-testid="button-send-confirmation"
                >
                  <Send className="h-4 w-4" />
                  Send Confirmation
                </Button>
                <Button
                  className="w-full bg-[#1C1C1C] text-white"
                  onClick={handleFinish}
                  data-testid="button-finish"
                >
                  Finish
                </Button>
              </div>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className="flex-1 h-full bg-cover bg-center bg-no-repeat relative overflow-auto"
      style={{ backgroundImage: `url(${restaurantBg})` }}
    >
      <div className="absolute inset-0 bg-white/40" />
      
      <div className="relative z-10 flex flex-col items-center min-h-full py-8 px-4">
        <h1 
          className="text-3xl italic mb-8"
          style={{ fontFamily: "'Playfair Display', serif", color: "#0D7377" }}
          data-testid="text-brand-title"
        >
          seated
        </h1>

        <div className="flex-1 flex items-center justify-center">
          {renderStep()}
        </div>

        {currentStep < 6 && (
          <div className="flex items-center gap-6 mt-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              disabled={currentStep === 1}
              className="rounded-full border border-foreground/20"
              data-testid="button-prev-step"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              disabled={!canGoNext()}
              className="rounded-full border border-foreground/20"
              data-testid="button-next-step"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
