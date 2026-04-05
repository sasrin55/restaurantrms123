import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Reservation } from "@shared/schema";
import { restaurantTables, tepanyakiSeats } from "@/lib/tables";

interface EditReservationDialogProps {
  reservation: Reservation | null;
  groupReservations?: Reservation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const availableTimes = [
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
  "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM",
  "9:00 PM", "9:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM",
  "12:00 AM", "12:30 AM", "1:00 AM", "1:30 AM", "2:00 AM",
];

export function EditReservationDialog({
  reservation,
  groupReservations,
  open,
  onOpenChange,
}: EditReservationDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState("4");
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [comments, setComments] = useState("");

  const { data: allReservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    enabled: open,
  });

  useEffect(() => {
    if (reservation) {
      setCustomerName(reservation.customerName);
      setDate(reservation.date);
      setTime(reservation.time);
      setPartySize(reservation.partySize.toString());
      setPhoneNumber(reservation.phoneNumber);
      setComments(reservation.comments || "");

      if (groupReservations && groupReservations.length > 0) {
        setSelectedTableIds(groupReservations.map(r => r.tableId));
      } else {
        setSelectedTableIds([reservation.tableId]);
      }
    }
  }, [reservation, groupReservations]);

  const ownIds = new Set((groupReservations || (reservation ? [reservation] : [])).map(r => r.id));
  const occupiedTableIds = new Set(
    allReservations
      .filter(r =>
        r.date === date &&
        r.time === time &&
        r.status !== "cancelled" &&
        r.status !== "no-show" &&
        r.status !== "complete" &&
        !ownIds.has(r.id)
      )
      .map(r => r.tableId)
  );

  const toggleTable = (tableId: number) => {
    if (occupiedTableIds.has(tableId)) return;
    setSelectedTableIds(prev => {
      if (prev.includes(tableId)) {
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== tableId);
      }
      return [...prev, tableId];
    });
  };

  const noShowMutation = useMutation({
    mutationFn: async () => {
      if (!reservation) return;
      const ids = (groupReservations || [reservation]).map(r => r.id);
      await Promise.all(
        ids.map(id => apiRequest("PATCH", `/api/reservations/${id}/status`, { status: "no-show" }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      onOpenChange(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!reservation) return;

      const existingIds = (groupReservations || [reservation]).map(r => r.id);
      const existingTableIds = (groupReservations || [reservation]).map(r => r.tableId);

      const tablesToKeep = selectedTableIds.filter(tid => existingTableIds.includes(tid));
      const tablesToAdd = selectedTableIds.filter(tid => !existingTableIds.includes(tid));
      const reservationsToDelete = (groupReservations || [reservation]).filter(
        r => !selectedTableIds.includes(r.tableId)
      );

      const commonFields = {
        customerName: customerName.trim(),
        date,
        time,
        partySize: parseInt(partySize),
        phoneNumber,
        comments: comments.trim(),
      };

      const promises: Promise<any>[] = [];

      for (const r of (groupReservations || [reservation])) {
        if (tablesToKeep.includes(r.tableId)) {
          const table = restaurantTables.find(t => t.id === r.tableId) ||
                        tepanyakiSeats.find(t => t.id === r.tableId);
          const tableName = table
            ? (r.tableId >= 1001 ? `Tepanyaki Seat ${table.number}` : `Table ${table.number}`)
            : r.tableName;
          promises.push(
            apiRequest("PATCH", `/api/reservations/${r.id}`, {
              ...commonFields,
              tableId: r.tableId,
              tableName,
            })
          );
        }
      }

      for (const tid of tablesToAdd) {
        const table = restaurantTables.find(t => t.id === tid) ||
                      tepanyakiSeats.find(t => t.id === tid);
        const tableName = table
          ? (tid >= 1001 ? `Tepanyaki Seat ${table.number}` : `Table ${table.number}`)
          : `Table ${tid}`;
        promises.push(
          apiRequest("POST", "/api/reservations", {
            ...commonFields,
            tableId: tid,
            tableName,
            status: reservation.status,
          })
        );
      }

      for (const r of reservationsToDelete) {
        promises.push(apiRequest("DELETE", `/api/reservations/${r.id}`));
      }

      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      onOpenChange(false);
    },
  });

  const handleSave = () => {
    updateMutation.mutate();
  };

  if (!reservation) return null;

  const selectedSet = new Set(selectedTableIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-reservation">
        <DialogHeader>
          <DialogTitle>Edit Reservation</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="guest-name">Guest Name</Label>
            <Input
              id="guest-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              data-testid="input-edit-guest-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="date-icon-right"
                data-testid="input-edit-date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="time">Time</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger data-testid="select-edit-time">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {availableTimes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="party-size">Party Size</Label>
            <Select value={partySize} onValueChange={setPartySize}>
              <SelectTrigger data-testid="select-edit-party-size">
                <SelectValue placeholder="Select party size" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size} {size === 1 ? "person" : "people"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Tables</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {restaurantTables.map((table) => {
                const isOccupied = occupiedTableIds.has(table.id);
                const isSelected = selectedSet.has(table.id);
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => toggleTable(table.id)}
                    disabled={isOccupied}
                    className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-[#0D7377] text-white border-[#0D7377]"
                        : isOccupied
                          ? "bg-muted text-muted-foreground/40 border-border cursor-not-allowed line-through"
                          : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                    data-testid={`button-edit-table-${table.id}`}
                  >
                    {table.number}
                  </button>
                );
              })}
            </div>
            <div className="mt-1">
              <Label className="text-xs text-muted-foreground">Tepanyaki</Label>
              <div className="grid grid-cols-8 gap-1.5 mt-1">
                {tepanyakiSeats.map((seat) => {
                  const isOccupied = occupiedTableIds.has(seat.id);
                  const isSelected = selectedSet.has(seat.id);
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      onClick={() => toggleTable(seat.id)}
                      disabled={isOccupied}
                      className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-[#0D7377] text-white border-[#0D7377]"
                          : isOccupied
                            ? "bg-muted text-muted-foreground/40 border-border cursor-not-allowed line-through"
                            : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                      data-testid={`button-edit-tep-${seat.id}`}
                    >
                      T{seat.number}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedTableIds.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-selected-tables">
                Selected: {selectedTableIds.map(tid => {
                  const t = restaurantTables.find(t => t.id === tid);
                  if (t) return `Table ${t.number}`;
                  const s = tepanyakiSeats.find(s => s.id === tid);
                  if (s) return `Tep ${s.number}`;
                  return `#${tid}`;
                }).join(", ")}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              data-testid="input-edit-phone"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              placeholder="Any special requests, allergies, or notes..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="input-edit-comments"
            />
          </div>
        </div>
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => noShowMutation.mutate()}
            disabled={noShowMutation.isPending || reservation.status === "no-show"}
            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-400"
            data-testid="button-mark-no-show"
          >
            {noShowMutation.isPending ? "Marking..." : "No Show"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || selectedTableIds.length === 0}
              className="bg-[#0D7377] text-white"
              data-testid="button-save-edit"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
