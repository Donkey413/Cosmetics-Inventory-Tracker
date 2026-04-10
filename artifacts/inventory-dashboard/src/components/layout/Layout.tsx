import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, PlusCircle, Package, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useGetInventorySummary } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const isActive = (path: string) => location === path;

  return (
    <div className="w-64 h-screen border-r border-border bg-card flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Package className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-sm uppercase tracking-wider text-foreground">Vela Inventory</h1>
            <p className="text-xs text-muted-foreground">Cosmetics Catalog</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pb-1 pt-2">Overview</p>
        <Link href="/">
          <span className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${isActive("/") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </span>
        </Link>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pb-1 pt-4">Stock Movements</p>
        <Link href="/stock/in">
          <span className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${isActive("/stock/in") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <ArrowDownToLine className="w-4 h-4" />
            Stock In
          </span>
        </Link>
        <Link href="/stock/out">
          <span className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${isActive("/stock/out") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <ArrowUpFromLine className="w-4 h-4" />
            Stock Out
          </span>
        </Link>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pb-1 pt-4">Catalog</p>
        <Link href="/products/new">
          <span className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${isActive("/products/new") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
            <PlusCircle className="w-4 h-4" />
            Add Product
          </span>
        </Link>
      </nav>

      <div className="p-4 border-t border-border text-xs text-muted-foreground">
        <p>Vela Inventory Management</p>
        <p>v1.0.0</p>
      </div>
    </div>
  );
}

export function Header() {
  const { data: summary } = useGetInventorySummary();

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
            <span className={`font-mono text-sm font-medium ${(summary?.lowStockCount || 0) > 0 ? "text-destructive" : "text-foreground"}`}>
              {summary?.lowStockCount || 0}
            </span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Out of Stock</span>
            <span className={`font-mono text-sm font-medium ${(summary?.outOfStockCount || 0) > 0 ? "text-destructive" : "text-foreground"}`}>
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
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
