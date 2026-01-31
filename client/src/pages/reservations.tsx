import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReservationCard, type ReservationStatus } from "@/components/reservation-card";
import { Plus, Search, Calendar, LayoutGrid, List } from "lucide-react";

interface Reservation {
  id: string;
  guestName: string;
  status: ReservationStatus;
  time: string;
  partySize: number;
  tableNumber: string;
  phone: string;
}

const mockReservations: Reservation[] = [];

export default function ReservationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [partySizeFilter, setPartySizeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredReservations = mockReservations.filter((reservation) => {
    const matchesSearch =
      reservation.guestName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reservation.phone.includes(searchQuery) ||
      reservation.tableNumber.includes(searchQuery);

    const matchesStatus =
      statusFilter === "all" || reservation.status === statusFilter;

    const matchesPartySize =
      partySizeFilter === "all" ||
      (partySizeFilter === "1-2" && reservation.partySize <= 2) ||
      (partySizeFilter === "3-4" && reservation.partySize >= 3 && reservation.partySize <= 4) ||
      (partySizeFilter === "5-6" && reservation.partySize >= 5 && reservation.partySize <= 6) ||
      (partySizeFilter === "7+" && reservation.partySize >= 7);

    return matchesSearch && matchesStatus && matchesPartySize;
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-1" data-testid="text-page-title">Reservations</h1>
            <p className="text-muted-foreground" data-testid="text-page-subtitle">Manage and view all of your reservations.</p>
          </div>
          <Button 
            className="bg-[#1C1C1C] text-white gap-2"
            data-testid="button-new-reservation"
          >
            <Plus className="h-4 w-4" />
            New Reservation
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or table"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background"
              data-testid="input-search"
            />
          </div>

          <Button variant="outline" className="gap-2 min-w-[120px]" data-testid="button-date-picker">
            <span>Today</span>
            <Calendar className="h-4 w-4" />
          </Button>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-status">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="seated">Seated</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>

          <Select value={partySizeFilter} onValueChange={setPartySizeFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-party-size">
              <SelectValue placeholder="All Party Sizes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Party Sizes</SelectItem>
              <SelectItem value="1-2">1-2 people</SelectItem>
              <SelectItem value="3-4">3-4 people</SelectItem>
              <SelectItem value="5-6">5-6 people</SelectItem>
              <SelectItem value="7+">7+ people</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-none rounded-l-md"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-none rounded-r-md"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {filteredReservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2" data-testid="text-empty-title">No reservations yet</h3>
            <p className="text-muted-foreground mb-4 max-w-sm" data-testid="text-empty-description">
              Start by creating your first reservation to manage your restaurant bookings.
            </p>
            <Button 
              className="bg-[#1C1C1C] text-white gap-2"
              data-testid="button-create-first-reservation"
            >
              <Plus className="h-4 w-4" />
              Create Reservation
            </Button>
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                : "flex flex-col gap-4"
            }
          >
            {filteredReservations.map((reservation) => (
              <ReservationCard
                key={reservation.id}
                {...reservation}
                onEdit={() => console.log("Edit", reservation.id)}
                onPrimaryAction={() => console.log("Primary action", reservation.id)}
                onSecondaryAction={() => console.log("Secondary action", reservation.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
