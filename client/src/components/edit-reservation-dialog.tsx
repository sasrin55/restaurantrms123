import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { restaurantTables } from "@/lib/tables";

interface EditReservationDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const availableTimes = [
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
  "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM",
  "9:00 PM", "9:30 PM", "10:00 PM"
];

export function EditReservationDialog({
  reservation,
  open,
  onOpenChange,
}: EditReservationDialogProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState("4");
  const [tableId, setTableId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [comments, setComments] = useState("");

  useEffect(() => {
    if (reservation) {
      setDate(reservation.date);
      setTime(reservation.time);
      setPartySize(reservation.partySize.toString());
      setTableId(reservation.tableId.toString());
      setPhoneNumber(reservation.phoneNumber);
      setComments(reservation.comments || "");
    }
  }, [reservation]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!reservation) return;
      const selectedTable = restaurantTables.find(t => t.id.toString() === tableId);
      return apiRequest("PATCH", `/api/reservations/${reservation.id}`, {
        date,
        time,
        partySize: parseInt(partySize),
        tableId: parseInt(tableId),
        tableName: selectedTable ? `Table ${selectedTable.number}` : reservation.tableName,
        phoneNumber,
        comments: comments.trim(),
      });
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

  const parsedSize = parseInt(partySize);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-edit-reservation">
        <DialogHeader>
          <DialogTitle>Edit Reservation</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="guest-name">Guest Name</Label>
            <Input
              id="guest-name"
              value={reservation.customerName}
              disabled
              className="bg-muted"
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
            <Select value={partySize} onValueChange={(val) => { setPartySize(val); setTableId(""); }}>
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
            <Label htmlFor="table">Table</Label>
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger data-testid="select-edit-table">
                <SelectValue placeholder="Select table" />
              </SelectTrigger>
              <SelectContent>
                {restaurantTables
                  .filter(t => parsedSize >= t.minCapacity && parsedSize <= t.maxCapacity)
                  .map((table) => (
                  <SelectItem key={table.id} value={table.id.toString()}>
                    Table {table.number} ({table.minCapacity === table.maxCapacity
                      ? `${table.minCapacity} seats`
                      : `${table.minCapacity}-${table.maxCapacity} seats`})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !tableId}
            className="bg-[#0D7377] text-white"
            data-testid="button-save-edit"
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
