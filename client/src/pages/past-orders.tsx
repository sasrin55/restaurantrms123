import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import type { Order, OrderItem } from "@shared/schema";

export default function PastOrdersPage() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const paidOrders = orders.filter((o) => o.status === "closed");

  const ordersByDate = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of paidOrders) {
      const dateStr = order.createdAt
        ? new Date(order.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "Unknown";
      const existing = map.get(dateStr) || [];
      existing.push(order);
      map.set(dateStr, existing);
    }
    const sorted = Array.from(map.entries()).sort((a, b) => {
      const da = new Date(a[0]);
      const db = new Date(b[0]);
      return db.getTime() - da.getTime();
    });
    return sorted;
  }, [paidOrders]);

  const [dateIdx, setDateIdx] = useState(0);

  const currentDate = ordersByDate[dateIdx]?.[0] || null;
  const currentOrders = ordersByDate[dateIdx]?.[1] || [];

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-muted-foreground">Loading past orders...</p>
      </div>
    );
  }

  if (paidOrders.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6" data-testid="text-past-orders-title">
          Past Orders
        </h1>
        <div className="text-center py-16">
          <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-1">No paid orders yet</h2>
          <p className="text-muted-foreground">
            Orders will appear here once they have been marked as paid
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-lg sm:text-2xl font-bold text-foreground mb-4 sm:mb-6" data-testid="text-past-orders-title">
        Past Orders
      </h1>

      <div className="flex items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <Button
          size="icon"
          variant="outline"
          disabled={dateIdx >= ordersByDate.length - 1}
          onClick={() => setDateIdx((i) => Math.min(i + 1, ordersByDate.length - 1))}
          data-testid="button-prev-date"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground" data-testid="text-current-date">
            {currentDate}
          </h2>
          <p className="text-xs text-muted-foreground">
            {currentOrders.length} order{currentOrders.length !== 1 ? "s" : ""} &middot;
            {" "}Page {dateIdx + 1} of {ordersByDate.length}
          </p>
        </div>
        <Button
          size="icon"
          variant="outline"
          disabled={dateIdx <= 0}
          onClick={() => setDateIdx((i) => Math.max(i - 1, 0))}
          data-testid="button-next-date"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {currentOrders.map((order) => (
          <PastOrderCard key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

function PastOrderCard({ order }: { order: Order }) {
  const { data: items = [] } = useQuery<OrderItem[]>({
    queryKey: ["/api/orders", order.id, "items"],
  });

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Card className="p-4" data-testid={`card-past-order-${order.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="font-semibold text-foreground">{order.tableName}</h3>
          {order.guestName && (
            <p className="text-xs text-foreground/70" data-testid={`text-past-guest-${order.id}`}>
              {order.guestName}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {order.createdAt
              ? new Date(order.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </p>
        </div>
        <Badge variant="secondary">Paid</Badge>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="mb-1">
          {totalItems} item{totalItems !== 1 ? "s" : ""}
        </p>
        {items.length > 0 && (
          <ScrollArea className="max-h-24">
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{item.itemName}</span>
                  <span className="text-muted-foreground flex-shrink-0">x{item.quantity}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>
    </Card>
  );
}
