import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  PlusCircle,
  Package,
  Upload,
  ClipboardList,
  Settings,
  LogOut,
  ArrowDownToLine,
  ArrowUpFromLine,
  Tag,
} from "lucide-react";
import { useGetInventorySummary, useGetSettings } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  permission?: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
    permission: "can_view_dashboard",
  },
  {
    href: "/products/new",
    label: "Add Product",
    icon: <PlusCircle className="w-4 h-4" />,
    permission: "can_manage_products",
  },
  {
    href: "/stock/in",
    label: "Stock In",
    icon: <ArrowDownToLine className="w-4 h-4" />,
    permission: "can_stock_in_out",
  },
  {
    href: "/stock/out",
    label: "Stock Out",
    icon: <ArrowUpFromLine className="w-4 h-4" />,
    permission: "can_stock_in_out",
  },
  {
    href: "/categories",
    label: "Categories",
    icon: <Tag className="w-4 h-4" />,
    permission: "can_manage_categories",
  },
  {
    href: "/import/products",
    label: "Import Products",
    icon: <Upload className="w-4 h-4" />,
    permission: "can_batch_upload",
  },
  {
    href: "/import/count",
    label: "Year-End Count",
    icon: <ClipboardList className="w-4 h-4" />,
    permission: "can_batch_upload",
  },
  {
    href: "/admin",
    label: "Admin Settings",
    icon: <Settings className="w-4 h-4" />,
    adminOnly: true,
  },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const { data: settings } = useGetSettings();

  const appName = settings?.appName ?? "Vela Inventory";

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return user?.isAdmin;
    if (item.permission) return hasPermission(item.permission);
    return true;
  });

  return (
    <div className="w-64 h-screen border-r border-border bg-card flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Package className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-sm uppercase tracking-wider text-foreground">
              {appName}
            </h1>
            <p className="text-xs text-muted-foreground">Cosmetics Catalog</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border space-y-3">
        {user && (
          <div className="text-xs text-muted-foreground truncate">
            <span className="font-medium text-foreground">{user.username}</span>
            {user.isAdmin && (
              <span className="ml-1 text-primary">(Admin)</span>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={logout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
        <p className="text-xs text-muted-foreground">v2.0.0</p>
      </div>
    </div>
  );
}

export function Header() {
  const { data: summary } = useGetInventorySummary();
  const { hasPermission } = useAuth();

  if (!hasPermission("can_view_dashboard")) return null;

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex items-center px-8">
      <div className="flex-1 flex justify-end">
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Products</span>
            <span className="font-mono text-sm font-medium">{summary?.totalProducts || 0}</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Value</span>
            <span className="font-mono text-sm font-medium">{formatCurrency(summary?.totalValue || 0)}</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Low Stock</span>
            <span
              className={`font-mono text-sm font-medium ${(summary?.lowStockCount || 0) > 0 ? "text-destructive" : "text-foreground"}`}
            >
              {summary?.lowStockCount || 0}
            </span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Out of Stock</span>
            <span
              className={`font-mono text-sm font-medium ${(summary?.outOfStockCount || 0) > 0 ? "text-destructive" : "text-foreground"}`}
            >
              {summary?.outOfStockCount || 0}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <Sidebar />
      <div className="pl-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
