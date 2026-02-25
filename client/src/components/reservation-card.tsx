import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Clock, Users, Phone, MessageSquare, ShoppingCart, Check, Pencil } from "lucide-react";

export type ReservationStatus = "seated" | "confirmed" | "pending" | "complete" | "cancelled";

interface ReservationCardProps {
  id: string;
  guestName: string;
  status: ReservationStatus;
  time: string;
  partySize: number;
  tableNumber: string;
  phone: string;
  comments?: string;
  orderConfirmed?: boolean;
  onEdit?: () => void;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onTertiaryAction?: () => void;
  onTakeOrder?: () => void;
}

const statusConfig: Record<ReservationStatus, { label: string; className: string }> = {
  seated: {
    label: "Seated",
    className: "bg-[#4A5D23] text-white",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-green-600 text-white",
  },
  pending: {
    label: "Pending",
    className: "bg-[#D4A72C] text-white",
  },
  complete: {
    label: "Complete",
    className: "bg-[#6B7280] text-white",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-rose-500 text-white",
  },
};

function getActionButtons(status: ReservationStatus) {
  switch (status) {
    case "seated":
      return {
        primary: { label: "Mark As Complete", className: "bg-[#0D7377] text-white" },
        secondary: { label: "Cancel", className: "bg-rose-100 text-rose-700 border-rose-200" },
        tertiary: { label: "Undo Seated", className: "bg-amber-100 text-amber-700 border-amber-200" },
      };
    case "confirmed":
      return {
        primary: { label: "Mark As Seated", className: "bg-[#0D7377] text-white" },
        secondary: { label: "Cancel", className: "bg-rose-100 text-rose-700 border-rose-200" },
        tertiary: null,
      };
    case "pending":
      return {
        primary: { label: "Confirm", className: "bg-[#0D7377] text-white" },
        secondary: { label: "Cancel", className: "bg-rose-100 text-rose-700 border-rose-200" },
        tertiary: null,
      };
    case "complete":
      return {
        primary: { label: "Remove Reservation", className: "bg-rose-100 text-rose-700 border-rose-200" },
        secondary: null,
        tertiary: null,
      };
    case "cancelled":
      return {
        primary: { label: "Undo Cancel", className: "bg-[#0D7377] text-white" },
        secondary: { label: "Remove Reservation", className: "bg-rose-100 text-rose-700 border-rose-200" },
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
  comments,
  orderConfirmed,
  onEdit,
  onPrimaryAction,
  onSecondaryAction,
  onTertiaryAction,
  onTakeOrder,
}: ReservationCardProps) {
  const statusStyle = statusConfig[status];
  const actions = getActionButtons(status);

  return (
    <Card className="p-4 bg-card border border-border" data-testid={`reservation-card-${id}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-foreground text-base truncate">{guestName}</h3>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusStyle.className}`}
          >
            {statusStyle.label}
          </span>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onEdit}
          data-testid={`button-edit-${id}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{time}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{partySize} people</span>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="6" width="10" height="2" rx="0.5" />
              <rect x="4" y="8" width="1" height="4" />
              <rect x="11" y="8" width="1" height="4" />
            </svg>
            <span className="text-xs sm:text-sm">{tableNumber.includes("+") ? "Tables" : "Table"} {tableNumber}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{phone}</span>
          </div>
        </div>
        {comments && (
          <div className="flex items-start gap-2 mt-1">
            <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="text-foreground/80 italic" data-testid={`text-comments-${id}`}>{comments}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {actions.primary && (
          <Button
            size="sm"
            onClick={onPrimaryAction}
            className={actions.primary.className}
            data-testid={`button-primary-${id}`}
          >
            {actions.primary.label}
          </Button>
        )}
        {onTakeOrder && (
          orderConfirmed ? (
            <Button
              size="sm"
              variant="outline"
              className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 pointer-events-none"
              data-testid={`button-order-confirmed-${id}`}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Paid
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onTakeOrder}
              data-testid={`button-take-order-${id}`}
            >
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
              Take Order
            </Button>
          )
        )}
        {actions.tertiary && (
          <Button
            size="sm"
            variant="outline"
            onClick={onTertiaryAction}
            className={actions.tertiary.className}
            data-testid={`button-tertiary-${id}`}
          >
            {actions.tertiary.label}
          </Button>
        )}
        {actions.secondary && (
          <Button
            size="sm"
            variant="outline"
            onClick={onSecondaryAction}
            className={actions.secondary.className}
            data-testid={`button-secondary-${id}`}
          >
            {actions.secondary.label}
          </Button>
        )}
      </div>
    </Card>
  );
}

interface ReservationRowProps {
  id: string;
  guestName: string;
  status: ReservationStatus;
  time: string;
  partySize: number;
  tableNumber: string;
  phone: string;
  comments?: string;
  orderConfirmed?: boolean;
  onEdit?: () => void;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onTertiaryAction?: () => void;
  onTakeOrder?: () => void;
}

export function ReservationRow({
  id,
  guestName,
  status,
  time,
  partySize,
  tableNumber,
  phone,
  comments,
  orderConfirmed,
  onEdit,
  onPrimaryAction,
  onSecondaryAction,
  onTertiaryAction,
  onTakeOrder,
}: ReservationRowProps) {
  const statusStyle = statusConfig[status];
  const actions = getActionButtons(status);

  return (
    <tr className="border-b border-border" data-testid={`reservation-row-${id}`}>
      <td className="py-3 px-3 text-foreground font-medium whitespace-nowrap">{guestName}</td>
      <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">{time}</td>
      <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">{partySize}</td>
      <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">{tableNumber}</td>
      <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">{phone}</td>
      <td className="py-3 px-3">
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusStyle.className}`}>
          {statusStyle.label}
        </span>
      </td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-1.5 flex-nowrap">
          {actions.primary && (
            <Button
              size="sm"
              onClick={onPrimaryAction}
              className={`${actions.primary.className} whitespace-nowrap`}
              data-testid={`button-primary-row-${id}`}
            >
              {actions.primary.label}
            </Button>
          )}
          {onTakeOrder && (
            orderConfirmed ? (
              <Button
                size="sm"
                variant="outline"
                className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 pointer-events-none whitespace-nowrap"
                data-testid={`button-order-confirmed-row-${id}`}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Paid
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onTakeOrder}
                className="whitespace-nowrap"
                data-testid={`button-take-order-row-${id}`}
              >
                <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                Take Order
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onEdit}
            data-testid={`button-edit-row-${id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {actions.tertiary && (
            <Button
              size="sm"
              variant="outline"
              onClick={onTertiaryAction}
              className={`${actions.tertiary.className} whitespace-nowrap`}
              data-testid={`button-tertiary-row-${id}`}
            >
              {actions.tertiary.label}
            </Button>
          )}
          {actions.secondary && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSecondaryAction}
              className={`${actions.secondary.className} whitespace-nowrap`}
              data-testid={`button-secondary-row-${id}`}
            >
              {actions.secondary.label}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
