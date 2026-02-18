import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import ReservationsPage from "@/pages/reservations";
import NewCustomerPage from "@/pages/new-reservation";
import GuestListPage from "@/pages/guest-list";
import TablesPage from "@/pages/tables";
import OrdersPage from "@/pages/orders";
import AnalyticsPage from "@/pages/analytics";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ReservationsPage} />
      <Route path="/new-reservation" component={NewCustomerPage} />
      <Route path="/guests" component={GuestListPage} />
      <Route path="/tables" component={TablesPage} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full bg-background">
            <AppSidebar />
            <main className="flex-1 overflow-auto">
              <Router />
            </main>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
