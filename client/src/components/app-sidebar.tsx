import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  PlusCircle,
  Table2,
  Users,
  Bell,
  Carrot,
  Settings,
  HelpCircle,
  LayoutGrid,
  ClipboardList,
  BarChart3,
  UtensilsCrossed,
  History,
  Phone,
  ListOrdered,
  LogOut,
} from "lucide-react";
import paolasLogo from "@/assets/images/paolas-logo.png";

const restaurantItems = [
  {
    title: "New Customer",
    url: "/new-reservation",
    icon: PlusCircle,
  },
  {
    title: "Waitlist",
    url: "/waitlist",
    icon: ListOrdered,
  },
  {
    title: "Reservations",
    url: "/",
    icon: Table2,
  },
  {
    title: "Tables",
    url: "/tables",
    icon: LayoutGrid,
  },
];

const generalItems = [
  {
    title: "Guest List",
    url: "/guests",
    icon: Users,
  },
  {
    title: "Servers",
    url: "/servers",
    icon: Bell,
  },
  {
    title: "Inventory Management",
    url: "/inventory",
    icon: Carrot,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
  {
    title: "Help & Feedback",
    url: "/help",
    icon: HelpCircle,
  },
];

export function AppSidebar({ onLogout }: { onLogout?: () => void }) {
  const [location] = useLocation();

  return (
    <Sidebar className="border-r border-sidebar-border">
      <div className="pt-6 px-5 pb-4 flex justify-center">
        <img 
          src={paolasLogo} 
          alt="PAOLA'S Cosa Nostra" 
          style={{ 
            width: "140px", 
            height: "auto", 
            mixBlendMode: "multiply" 
          }}
          data-testid="img-logo"
        />
      </div>
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center gap-2 px-4 mb-3 pl-[8px] pr-[8px]">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              Restaurant
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {restaurantItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className={isActive ? "bg-sidebar-accent" : ""}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="pt-0 pb-0">
          <div className="flex items-center gap-2 px-4 pl-[8px] pr-[8px] mt-[6px] mb-[6px]">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              Order
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/orders"}
                  className={location === "/orders" ? "bg-sidebar-accent" : ""}
                >
                  <Link href="/orders" data-testid="nav-order">
                    <ClipboardList className="h-4 w-4" />
                    <span>Order</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/past-orders"}
                  className={location === "/past-orders" ? "bg-sidebar-accent" : ""}
                >
                  <Link href="/past-orders" data-testid="nav-past-orders">
                    <History className="h-4 w-4" />
                    <span>Past Orders</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/menu"}
                  className={location === "/menu" ? "bg-sidebar-accent" : ""}
                >
                  <Link href="/menu" data-testid="nav-menu">
                    <UtensilsCrossed className="h-4 w-4" />
                    <span>Menu</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <div className="flex items-center gap-2 px-4 mt-[6px] mb-[6px] pl-[8px] pr-[8px]">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              General
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {generalItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      data-active={isActive}
                      className={isActive ? "bg-sidebar-accent" : ""}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <div className="flex items-center gap-2 px-4 mt-[6px] mb-[6px] pl-[8px] pr-[8px]">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              Call Log
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/calls"}
                  className={location === "/calls" ? "bg-sidebar-accent" : ""}
                >
                  <Link href="/calls" data-testid="nav-calls">
                    <Phone className="h-4 w-4" />
                    <span>Incoming Calls</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <button
          data-testid="button-logout"
          onClick={() => onLogout?.()}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span>Log out</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
