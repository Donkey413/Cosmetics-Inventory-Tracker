import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import NewProduct from "@/pages/new-product";
import ImportProductsPage from "@/pages/import-products";
import ImportCountPage from "@/pages/import-count";
import AdminPage from "@/pages/admin";
import LoginPage from "@/pages/login";
import StockIn from "@/pages/stock-in";
import StockOut from "@/pages/stock-out";
import { Layout } from "@/components/layout/Layout";
import { AuthProvider, useAuth } from "@/context/AuthContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on 401/403
        if (error && typeof error === "object" && "status" in error) {
          const status = (error as { status: number }).status;
          if (status === 401 || status === 403) return false;
        }
        return failureCount < 2;
      },
    },
  },
});

function PermissionGuard({
  permission,
  adminOnly,
  children,
}: {
  permission?: string;
  adminOnly?: boolean;
  children: React.ReactNode;
}) {
  const { user, hasPermission } = useAuth();

  if (adminOnly && !user?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
        <p className="text-lg font-semibold text-foreground">Access Denied</p>
        <p className="text-sm text-muted-foreground">This section requires administrator access.</p>
      </div>
    );
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
        <p className="text-lg font-semibold text-foreground">Access Denied</p>
        <p className="text-sm text-muted-foreground">
          You don't have the required permission: <span className="font-mono text-xs">{permission}</span>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

function AuthenticatedApp() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/">
          <PermissionGuard permission="can_view_dashboard">
            <Dashboard />
          </PermissionGuard>
        </Route>

        <Route path="/products/new">
          <PermissionGuard permission="can_manage_products">
            <NewProduct />
          </PermissionGuard>
        </Route>

        <Route path="/import/products">
          <PermissionGuard permission="can_batch_upload">
            <ImportProductsPage />
          </PermissionGuard>
        </Route>

        <Route path="/import/count">
          <PermissionGuard permission="can_batch_upload">
            <ImportCountPage />
          </PermissionGuard>
        </Route>

        <Route path="/stock/in">
          <PermissionGuard permission="can_stock_in_out">
            <StockIn />
          </PermissionGuard>
        </Route>

        <Route path="/stock/out">
          <PermissionGuard permission="can_stock_in_out">
            <StockOut />
          </PermissionGuard>
        </Route>

        <Route path="/admin">
          <PermissionGuard adminOnly>
            <AdminPage />
          </PermissionGuard>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthenticatedApp />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
