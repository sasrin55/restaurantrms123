import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Clock, User, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import type { Reservation } from "@shared/schema";

interface EnrichedCall {
  id: string;
  phone: string;
  customerId: string | null;
  isNewCustomer: number;
  createdAt: string;
  guestName: string;
  visitCount: number;
  lastReservation: Reservation | null;
}

export default function CallsPage() {
  const { data: calls = [], isLoading } = useQuery<EnrichedCall[]>({
    queryKey: ["/api/calls"],
    refetchInterval: 5000,
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6 border-b pb-4 sm:pb-6">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-semibold text-foreground mb-0.5 sm:mb-1" data-testid="text-page-title">Call Log</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block" data-testid="text-page-subtitle">Live feed of incoming calls and customer information.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0D7377]" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Phone className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No calls yet</p>
            <p className="text-sm mt-1">Incoming calls will appear here in real-time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => (
              <Card key={call.id} className="p-4 bg-card border border-border" data-testid={`call-card-${call.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground" data-testid={`text-call-phone-${call.id}`}>{call.phone}</span>
                        {call.isNewCustomer === 1 ? (
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 text-xs" data-testid={`badge-new-${call.id}`}>New</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-xs" data-testid={`badge-returning-${call.id}`}>Returning</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          <span>{call.guestName}</span>
                        </div>
                        {call.visitCount > 0 && (
                          <span>{call.visitCount} visit{call.visitCount !== 1 ? "s" : ""}</span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{call.createdAt ? format(new Date(call.createdAt), "MMM d, h:mm a") : "—"}</span>
                        </div>
                      </div>
                      {call.lastReservation && (
                        <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded px-2.5 py-1.5 inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3 w-3" />
                          <span>Last booking: {call.lastReservation.date} at {call.lastReservation.time} — {call.lastReservation.partySize} pax, {call.lastReservation.tableName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
