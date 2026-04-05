import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import ReservationsPage from "@/pages/reservations";
import NewCustomerPage from "@/pages/new-reservation";
import GuestListPage from "@/pages/guest-list";
import TablesPage from "@/pages/tables";
import OrdersPage from "@/pages/orders";
import AnalyticsPage from "@/pages/analytics";
import MenuManagementPage from "@/pages/menu-management";
import PastOrdersPage from "@/pages/past-orders";
import CallsPage from "@/pages/calls";
import WaitlistPage from "@/pages/waitlist";
import LoginPage from "@/pages/login";
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
      <Route path="/menu" component={MenuManagementPage} />
      <Route path="/past-orders" component={PastOrdersPage} />
      <Route path="/calls" component={CallsPage} />
      <Route path="/waitlist" component={WaitlistPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("seated_auth") === "1");

  if (!authed) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <LoginPage onLogin={() => setAuthed(true)} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

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
              <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-background px-4 py-2">
                <SidebarTrigger data-testid="button-mobile-menu" />
                <span className="text-sm font-semibold text-foreground">PAOLA'S</span>
              </div>
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
