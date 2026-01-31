import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Clock, Users, Armchair, Phone } from "lucide-react";

export type ReservationStatus = "seated" | "confirmed" | "pending" | "complete";

interface ReservationCardProps {
  id: string;
  guestName: string;
  status: ReservationStatus;
  time: string;
  partySize: number;
  tableNumber: string;
  phone: string;
  onEdit?: () => void;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onTertiaryAction?: () => void;
}

const statusConfig: Record<ReservationStatus, { label: string; className: string }> = {
  seated: {
    label: "Seated",
    className: "bg-[#4A5D23] text-white",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-[#0D7377] text-white",
  },
  pending: {
    label: "Pending",
    className: "bg-[#D4A72C] text-white",
  },
  complete: {
    label: "Complete",
    className: "bg-[#6B7280] text-white",
  },
};

function getActionButtons(status: ReservationStatus) {
  switch (status) {
    case "seated":
      return {
        primary: { label: "Mark As Complete", variant: "default" as const },
        secondary: null,
        tertiary: null,
      };
    case "confirmed":
      return {
        primary: { label: "Mark As Seated", variant: "default" as const },
        secondary: null,
        tertiary: null,
      };
    case "pending":
      return {
        primary: { label: "Confirm", variant: "default" as const },
        secondary: { label: "Cancel", variant: "destructive" as const },
        tertiary: null,
      };
    case "complete":
      return {
        primary: { label: "Remove Reservation", variant: "secondary" as const },
        secondary: null,
        tertiary: null,
      };
    default:
      return { primary: null, secondary: null, tertiary: null };
  }
}

export function ReservationCard({
  id,
  guestName,
  status,
  time,
  partySize,
  tableNumber,
  phone,
  onEdit,
  onPrimaryAction,
  onSecondaryAction,
}: ReservationCardProps) {
  const statusStyle = statusConfig[status];
  const actions = getActionButtons(status);

  return (
    <Card className="p-4 bg-card border border-card-border" data-testid={`reservation-card-${id}`}>
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-semibold text-foreground text-base">{guestName}</h3>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyle.className}`}
        >
          {statusStyle.label}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>{time}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{partySize} people</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Armchair className="h-4 w-4" />
            <span>Table {tableNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            <span>{phone}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          data-testid={`button-edit-${id}`}
        >
          Edit
        </Button>
        {actions.primary && (
          <Button
            variant={actions.primary.variant}
            size="sm"
            onClick={onPrimaryAction}
            className={
              actions.primary.variant === "default" || actions.primary.variant === "secondary"
                ? "bg-[#1C1C1C] text-white"
                : ""
            }
            data-testid={`button-primary-${id}`}
          >
            {actions.primary.label}
          </Button>
        )}
        {actions.secondary && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onSecondaryAction}
            data-testid={`button-secondary-${id}`}
          >
            {actions.secondary.label}
          </Button>
        )}
      </div>
    </Card>
  );
}
