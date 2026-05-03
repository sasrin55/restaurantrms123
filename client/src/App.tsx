import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ProtectedRoute } from "@/components/protected-route";
import LoginPage from "@/pages/login";
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
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Open inside the app — no secondary password */}
      <Route path="/" component={ReservationsPage} />
      <Route path="/new-reservation" component={NewCustomerPage} />
      <Route path="/tables" component={TablesPage} />
      <Route path="/waitlist" component={WaitlistPage} />

      {/* Protected inside the app — requires password "Seated" */}
      <Route path="/guests">
        <ProtectedRoute><GuestListPage /></ProtectedRoute>
      </Route>
      <Route path="/orders">
        <ProtectedRoute><OrdersPage /></ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute><AnalyticsPage /></ProtectedRoute>
      </Route>
      <Route path="/menu">
        <ProtectedRoute><MenuManagementPage /></ProtectedRoute>
      </Route>
      <Route path="/past-orders">
        <ProtectedRoute><PastOrdersPage /></ProtectedRoute>
      </Route>
      <Route path="/calls">
        <ProtectedRoute><CallsPage /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute><SettingsPage /></ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem("seated_auth") === "1"
  );

  function handleLogout() {
    sessionStorage.removeItem("seated_auth");
    sessionStorage.removeItem("seated_admin");
    setAuthed(false);
  }

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
            <AppSidebar onLogout={handleLogout} />
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
