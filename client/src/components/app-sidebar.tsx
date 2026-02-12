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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  PlusCircle,
  Table2,
  Users,
  Bell,
  Carrot,
  Settings,
  HelpCircle,
  ArrowRight,
  LayoutGrid,
} from "lucide-react";
import paolasLogo from "@/assets/images/paolas-logo.png";

const restaurantItems = [
  {
    title: "New Reservation",
    url: "/new-reservation",
    icon: PlusCircle,
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
];

const generalItems = [
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

export function AppSidebar() {
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
          <div className="flex items-center gap-2 px-4 mb-3">
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
        <SidebarGroup>
          <div className="flex items-center gap-2 px-4 mb-3 mt-4">
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
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src="" />
            <AvatarFallback className="bg-orange-100 text-orange-600">N</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">Naqash</p>
            <p className="text-xs text-muted-foreground truncate">naqash@cosanostra.com</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
