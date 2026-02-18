import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Minus,
  Trash2,
  ArrowLeft,
  Search,
  ShoppingCart,
  ClipboardList,
  Check,
  X,
} from "lucide-react";
import type { Order, OrderItem } from "@shared/schema";
import { restaurantTables, tepanyakiSeats } from "@/lib/tables";

interface MenuCategoryData {
  category: string;
  items: { id: string; itemName: string }[];
}

type ViewMode = "table-select" | "menu" | "order-review" | "order-list";

export default function OrdersPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("order-list");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedTableName, setSelectedTableName] = useState("");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeCategoryIdx, setActiveCategoryIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const { data: activeOrderItems = [], isLoading: itemsLoading } = useQuery<OrderItem[]>({
    queryKey: ["/api/orders", activeOrderId, "items"],
    enabled: !!activeOrderId,
  });

  const { data: menuCategories = [] } = useQuery<MenuCategoryData[]>({
    queryKey: ["/api/menu"],
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: { tableId: number; tableName: string; guestId?: string; guestName?: string }) => {
      const res = await apiRequest("POST", "/api/orders", data);
      return res.json();
    },
    onSuccess: (order: Order) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setActiveOrderId(order.id);
      setViewMode("menu");
      toast({ title: `Order started for ${order.tableName}${order.guestName ? ` (${order.guestName})` : ""}` });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: { category: string; itemName: string }) => {
      const res = await apiRequest("POST", `/api/orders/${activeOrderId}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", activeOrderId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/menu"] });
    },
  });

  const updateItemQtyMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const res = await apiRequest("PATCH", `/api/order-items/${id}`, { quantity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", activeOrderId, "items"] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/order-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", activeOrderId, "items"] });
    },
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/menu"] });
      toast({ title: "Order updated" });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/menu"] });
      toast({ title: "Order deleted" });
    },
  });

  const handleStartNewOrder = () => {
    setSelectedTableId(null);
    setSelectedTableName("");
    setViewMode("table-select");
  };

  const handleSelectTable = (tableId: number, tableName: string) => {
    setSelectedTableId(tableId);
    setSelectedTableName(tableName);
    createOrderMutation.mutate({ tableId, tableName });
  };

  const handleOpenOrder = (order: Order) => {
    setActiveOrderId(order.id);
    setSelectedTableId(order.tableId);
    setSelectedTableName(order.tableName);
    setViewMode("menu");
  };

  const handleBackToList = () => {
    setActiveOrderId(null);
    setViewMode("order-list");
    setSearchQuery("");
  };

  const activeCategory = menuCategories[activeCategoryIdx] || menuCategories[0];

  const filteredItems = searchQuery.trim()
    ? menuCategories.flatMap((cat) =>
        cat.items
          .filter((item) =>
            item.itemName.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map((item) => ({ ...item, category: cat.category }))
      )
    : activeCategory?.items.map((item) => ({
        ...item,
        category: activeCategory.category,
      })) || [];

  const openOrders = orders.filter((o) => o.status === "open");
  const closedOrders = orders.filter((o) => o.status === "closed");

  if (viewMode === "table-select") {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setViewMode("order-list")}
            data-testid="button-back-to-orders"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-select-table-title">
            Select Table
          </h1>
        </div>

        <div className="mb-6">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Tables
          </h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {restaurantTables.map((table) => (
              <Button
                key={table.id}
                variant="outline"
                className="h-14 text-lg font-semibold"
                onClick={() => handleSelectTable(table.id, `Table ${table.number}`)}
                data-testid={`button-select-table-${table.id}`}
              >
                {table.number}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Tepanyaki Bar
          </h2>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {tepanyakiSeats.map((seat) => (
              <Button
                key={seat.id}
                variant="outline"
                className="h-14 text-lg font-semibold"
                onClick={() => handleSelectTable(seat.id, `Tep ${seat.number}`)}
                data-testid={`button-select-tep-${seat.id}`}
              >
                T{seat.number}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }


  if (viewMode === "order-review" && activeOrderId) {
    const totalItems = activeOrderItems.reduce((s, i) => s + i.quantity, 0);
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setViewMode("menu")}
            data-testid="button-back-to-menu"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground" data-testid="text-review-title">
              Order Summary
            </h1>
            <p className="text-xs text-muted-foreground">
              {selectedTableName} &middot; {totalItems} item{totalItems !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {activeOrderItems.map((item, idx) => (
              <Card
                key={item.id}
                className="flex items-center justify-between px-4 py-3 gap-3"
                data-testid={`review-item-${idx}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Badge variant="secondary" data-testid={`review-qty-${idx}`}>
                    x{item.quantity}
                  </Badge>
                  <span className="text-sm font-medium text-foreground truncate" data-testid={`review-name-${idx}`}>
                    {item.itemName}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{item.category}</span>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t p-4 space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setViewMode("menu")}
            data-testid="button-edit-order"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Edit Order
          </Button>
          <Button
            className="w-full"
            onClick={() => {
              updateOrderStatusMutation.mutate({
                id: activeOrderId,
                status: "closed",
              });
              handleBackToList();
            }}
            data-testid="button-close-order"
          >
            <Check className="h-4 w-4 mr-2" />
            Complete Order
          </Button>
        </div>
      </div>
    );
  }

  if (viewMode === "menu" && activeOrderId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleBackToList}
            data-testid="button-back-from-menu"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground" data-testid="text-order-table-name">
              {selectedTableName}
            </h1>
            <p className="text-xs text-muted-foreground">
              {itemsLoading ? "Loading..." : `${activeOrderItems.length} item${activeOrderItems.length !== 1 ? "s" : ""} in order`}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-48"
              data-testid="input-menu-search"
            />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {!searchQuery.trim() && (
            <ScrollArea className="w-48 border-r flex-shrink-0">
              <div className="p-2 space-y-0.5">
                {menuCategories.map((cat, idx) => (
                  <button
                    key={cat.category}
                    onClick={() => setActiveCategoryIdx(idx)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      activeCategoryIdx === idx
                        ? "bg-sidebar-accent font-medium text-foreground"
                        : "text-muted-foreground hover-elevate"
                    }`}
                    data-testid={`button-category-${idx}`}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4">
                {!searchQuery.trim() && (
                  <h2
                    className="text-lg font-semibold text-foreground mb-3"
                    data-testid="text-active-category"
                  >
                    {activeCategory?.category}
                  </h2>
                )}
                {searchQuery.trim() && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""} for "{searchQuery}"
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredItems.map((item, idx) => {
                    const existingItem = activeOrderItems.find(
                      (oi) => oi.itemName === item.itemName
                    );
                    return (
                      <Card
                        key={`${item.itemName}-${idx}`}
                        className="flex items-center justify-between px-3 py-2.5 gap-2"
                        data-testid={`card-menu-item-${idx}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.itemName}
                          </p>
                          {searchQuery.trim() && (
                            <p className="text-xs text-muted-foreground">{item.category}</p>
                          )}
                        </div>
                        {existingItem ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateItemQtyMutation.mutate({
                                  id: existingItem.id,
                                  quantity: existingItem.quantity - 1,
                                })
                              }
                              data-testid={`button-decrease-${idx}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="text-sm font-semibold w-6 text-center" data-testid={`text-qty-${idx}`}>
                              {existingItem.quantity}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateItemQtyMutation.mutate({
                                  id: existingItem.id,
                                  quantity: existingItem.quantity + 1,
                                })
                              }
                              data-testid={`button-increase-${idx}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              addItemMutation.mutate({
                                category: item.category,
                                itemName: item.itemName,
                              })
                            }
                            data-testid={`button-add-item-${idx}`}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>

            {activeOrderItems.length > 0 && (
              <div className="border-t p-4 bg-muted/30">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <ShoppingCart className="h-4 w-4" />
                    Current Order ({activeOrderItems.reduce((s, i) => s + i.quantity, 0)} items)
                  </h3>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto mb-3">
                  {activeOrderItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm gap-2"
                      data-testid={`order-item-${item.id}`}
                    >
                      <span className="text-foreground truncate flex-1 min-w-0">
                        {item.itemName}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateItemQtyMutation.mutate({
                              id: item.id,
                              quantity: item.quantity - 1,
                            })
                          }
                          data-testid={`button-summary-decrease-${item.id}`}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="font-medium w-5 text-center" data-testid={`text-summary-qty-${item.id}`}>{item.quantity}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateItemQtyMutation.mutate({
                              id: item.id,
                              quantity: item.quantity + 1,
                            })
                          }
                          data-testid={`button-summary-increase-${item.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteItemMutation.mutate(item.id)}
                          data-testid={`button-summary-delete-${item.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  onClick={() => setViewMode("order-review")}
                  data-testid="button-review-order"
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Review Order
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-orders-title">
          Orders
        </h1>
        <Button onClick={handleStartNewOrder} data-testid="button-new-order">
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </div>

      {ordersLoading ? (
        <p className="text-muted-foreground">Loading orders...</p>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-1">No orders yet</h2>
          <p className="text-muted-foreground mb-4">
            Start a new order by selecting a table
          </p>
          <Button onClick={handleStartNewOrder} data-testid="button-new-order-empty">
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {openOrders.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Open Orders
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {openOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onOpen={() => handleOpenOrder(order)}
                    onClose={() =>
                      updateOrderStatusMutation.mutate({ id: order.id, status: "closed" })
                    }
                    onDelete={() => deleteOrderMutation.mutate(order.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {closedOrders.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Completed Orders
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {closedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onOpen={() => handleOpenOrder(order)}
                    onDelete={() => deleteOrderMutation.mutate(order.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  onOpen,
  onClose,
  onDelete,
}: {
  order: Order;
  onOpen: () => void;
  onClose?: () => void;
  onDelete: () => void;
}) {
  const { data: items = [] } = useQuery<OrderItem[]>({
    queryKey: ["/api/orders", order.id, "items"],
  });

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const isOpen = order.status === "open";

  return (
    <Card
      className="p-4 hover-elevate cursor-pointer"
      onClick={onOpen}
      data-testid={`card-order-${order.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="font-semibold text-foreground">{order.tableName}</h3>
          {order.guestName && (
            <p className="text-xs text-foreground/70" data-testid={`text-order-guest-${order.id}`}>{order.guestName}</p>
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
        <Badge variant={isOpen ? "default" : "secondary"}>
          {isOpen ? "Open" : "Closed"}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        {totalItems} item{totalItems !== 1 ? "s" : ""}
        {items.length > 0 && (
          <span>
            {" "}
            - {items.slice(0, 3).map((i) => i.itemName).join(", ")}
            {items.length > 3 ? "..." : ""}
          </span>
        )}
      </p>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {isOpen && onClose && (
          <Button size="sm" variant="outline" onClick={onClose} data-testid={`button-close-order-${order.id}`}>
            <Check className="h-3.5 w-3.5 mr-1" />
            Complete
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={onDelete}
          data-testid={`button-delete-order-${order.id}`}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Delete
        </Button>
      </div>
    </Card>
  );
}
