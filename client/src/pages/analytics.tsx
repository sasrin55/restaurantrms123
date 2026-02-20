import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, TrendingUp, ShoppingCart, Loader2, Package } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface MenuAnalytics {
  topItems: { name: string; category: string; totalQty: number; orderCount: number }[];
  categoryBreakdown: { category: string; totalQty: number }[];
  totalOrders: number;
  totalItemsOrdered: number;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
];

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery<MenuAnalytics>({
    queryKey: ["/api/analytics/menu"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData = data && data.totalOrders > 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-3 sm:p-6 max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-lg sm:text-3xl font-semibold text-foreground mb-0.5 sm:mb-1" data-testid="text-analytics-title">
            Menu Analytics
          </h1>
          <p className="text-xs sm:text-base text-muted-foreground" data-testid="text-analytics-subtitle">
            Insights into menu item popularity and ordering patterns.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card data-testid="card-total-orders">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="text-total-orders-value">{data?.totalOrders || 0}</p>
                <p className="text-sm text-muted-foreground">Total Orders</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-total-items">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="text-total-items-value">{data?.totalItemsOrdered || 0}</p>
                <p className="text-sm text-muted-foreground">Items Ordered</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-avg-items">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="text-avg-items-value">
                  {data && data.totalOrders > 0 ? Math.round(data.totalItemsOrdered / data.totalOrders) : 0}
                </p>
                <p className="text-sm text-muted-foreground">Avg Items/Order</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2" data-testid="text-no-data-title">
              No order data yet
            </h3>
            <p className="text-muted-foreground max-w-sm" data-testid="text-no-data-description">
              Analytics will appear here once orders are placed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-top-items-chart">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Top Menu Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.topItems.slice(0, 10)}
                      layout="vertical"
                      margin={{ left: 0, right: 16, top: 8, bottom: 8 }}
                    >
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(val: string) => val.length > 18 ? val.slice(0, 18) + "..." : val}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="totalQty" name="Quantity" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-category-chart">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Category Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.categoryBreakdown.slice(0, 10)}
                        dataKey="totalQty"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ category, percent }) =>
                          `${category.length > 12 ? category.slice(0, 12) + "..." : category} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine={{ strokeWidth: 1 }}
                      >
                        {data.categoryBreakdown.slice(0, 10).map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2" data-testid="card-top-items-list">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  All Popular Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {data.topItems.map((item, idx) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between gap-3 py-2 border-b last:border-0"
                        data-testid={`row-top-item-${idx}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-sm font-medium text-muted-foreground w-6 text-right flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.category}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary">{item.totalQty} ordered</Badge>
                          <span className="text-xs text-muted-foreground">
                            in {item.orderCount} order{item.orderCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
