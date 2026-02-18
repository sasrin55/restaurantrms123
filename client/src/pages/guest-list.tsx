import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Users, Phone, Calendar, Loader2, Trash2, Star, ShoppingCart } from "lucide-react";
import { format, parseISO } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Guest {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  lastVisit: string;
  totalPartySize: number;
}

interface GuestAnalytics {
  favouriteItems: { name: string; quantity: number }[];
  totalOrders: number;
  totalItemsOrdered: number;
  avgItemsPerOrder: number;
}

function GuestOrderStats({ guestId }: { guestId: string }) {
  const { data } = useQuery<GuestAnalytics>({
    queryKey: ["/api/analytics/guests", guestId],
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (!data || data.totalOrders === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShoppingCart className="h-3 w-3" />
          <span data-testid={`text-guest-orders-${guestId}`}>{data.totalOrders} order{data.totalOrders !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span data-testid={`text-guest-avg-items-${guestId}`}>~{data.avgItemsPerOrder} items/order</span>
        </div>
      </div>
      {data.favouriteItems.length > 0 && (
        <div className="flex items-start gap-1.5">
          <Star className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex flex-wrap gap-1" data-testid={`text-guest-favourites-${guestId}`}>
            {data.favouriteItems.slice(0, 3).map((item) => (
              <Badge key={item.name} variant="secondary" className="text-xs">
                {item.name} ({item.quantity})
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GuestListPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: guests = [], isLoading } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const deleteGuestMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/guests/${id}`),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/guests"] });
    },
  });

  const filteredGuests = guests.filter((guest) => {
    const matchesSearch =
      guest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.phone.includes(searchQuery);
    return matchesSearch;
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatLastVisit = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-1" data-testid="text-page-title">
            Guest List
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-subtitle">
            Directory of all customers who have dined at your restaurant.
          </p>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone number"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background"
              data-testid="input-search-guests"
            />
          </div>
          <div className="text-sm text-muted-foreground" data-testid="text-guest-count">
            {filteredGuests.length} {filteredGuests.length === 1 ? "guest" : "guests"}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredGuests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2" data-testid="text-empty-title">
              {searchQuery ? "No guests found" : "No guests yet"}
            </h3>
            <p className="text-muted-foreground mb-4 max-w-sm" data-testid="text-empty-description">
              {searchQuery 
                ? "Try a different search term."
                : "Guests will appear here once they make reservations."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGuests.map((guest) => (
              <Card key={guest.id} className="hover-elevate" data-testid={`card-guest-${guest.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-[#0D7377] text-white font-medium">
                        {getInitials(guest.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate" data-testid={`text-guest-name-${guest.id}`}>
                        {guest.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                        <Phone className="h-3.5 w-3.5" />
                        <span data-testid={`text-guest-phone-${guest.id}`}>{guest.phone}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge 
                        variant="secondary" 
                        data-testid={`badge-visit-count-${guest.id}`}
                      >
                        {guest.visitCount} {guest.visitCount === 1 ? "visit" : "visits"}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteGuestMutation.mutate(guest.id)}
                        disabled={deleteGuestMutation.isPending}
                        data-testid={`button-remove-guest-${guest.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t flex items-center justify-between gap-2 text-sm flex-wrap">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Last visit: {formatLastVisit(guest.lastVisit)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>Avg party: {Math.round(guest.totalPartySize / guest.visitCount)}</span>
                    </div>
                  </div>
                  <GuestOrderStats guestId={guest.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
