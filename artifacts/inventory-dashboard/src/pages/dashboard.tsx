import { useState } from "react";
import {
  useListProducts,
  useListCategories,
  useDeleteProduct,
  useUpdateProduct,
  getListProductsQueryKey,
  Product,
} from "@workspace/api-client-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, AlertCircle, Edit2, Trash2, Download, FileSpreadsheet } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  id: number;
  productId: number;
  productName: string;
  productSku: string;
  productCategory: string;
  type: string;
  quantityChange: number;
  openingBalance: number;
  closingBalance: number;
  notes: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Date range dialog
// ---------------------------------------------------------------------------

function DateRangeDialog({
  open,
  title,
  description,
  onConfirm,
  onClose,
  loading,
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: (from: string, to: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="from-date">From date</Label>
            <Input
              id="from-date"
              type="date"
              value={from}
              max={to || today}
              onChange={(e) => setFrom(e.target.value)}
              data-testid="input-from-date"
            />
            <p className="text-xs text-muted-foreground">Leave blank to include all records from the beginning.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="to-date">To date</Label>
            <Input
              id="to-date"
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              data-testid="input-to-date"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={() => onConfirm(from, to)} disabled={loading} data-testid="button-confirm-download">
            {loading ? "Exporting..." : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

async function fetchLogs(from: string, to: string): Promise<LogEntry[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`/api/inventory-logs?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}

async function fetchAllProducts(): Promise<Product[]> {
  const res = await fetch("/api/products");
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

async function downloadRawLog(from: string, to: string) {
  const logs = await fetchLogs(from, to);
  const XLSX = await import("xlsx");

  const rows = logs.map((log) => ({
    "Log ID": log.id,
    "Timestamp": new Date(log.createdAt).toLocaleString(),
    "Product Name": log.productName,
    "SKU": log.productSku,
    "Category": log.productCategory,
    "Movement Type": log.type.charAt(0).toUpperCase() + log.type.slice(1),
    "Opening Balance": log.openingBalance,
    "Qty In": log.quantityChange > 0 ? log.quantityChange : "",
    "Qty Out": log.quantityChange < 0 ? Math.abs(log.quantityChange) : "",
    "Closing Balance": log.closingBalance,
    "Notes": log.notes ?? "",
  }));

  // Sort oldest → newest for ledger-style reading
  rows.reverse();

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 8 }, { wch: 22 }, { wch: 35 }, { wch: 14 }, { wch: 16 },
    { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 35 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory Ledger");
  const suffix = from ? `${from}_to_${to}` : `to_${to}`;
  XLSX.writeFile(wb, `inventory-ledger-${suffix}.xlsx`);
}

async function downloadInventoryReport(from: string, to: string) {
  const [logs, allProducts] = await Promise.all([
    fetchLogs(from, to),
    fetchAllProducts(),
  ]);

  // For each product, compute:
  //   beginningBalance = openingBalance of the EARLIEST log in range (or current stock if no logs in range)
  //   totalIn, totalOut within range
  //   endingBalance = closingBalance of the LATEST log in range (or beginningBalance if no logs)

  // Group logs by product, sorted oldest first
  const logsByProduct = new Map<number, LogEntry[]>();
  for (const log of logs) {
    if (!logsByProduct.has(log.productId)) logsByProduct.set(log.productId, []);
    logsByProduct.get(log.productId)!.push(log);
  }
  for (const arr of logsByProduct.values()) {
    arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const XLSX = await import("xlsx");
  const rows: object[] = [];

  for (const product of allProducts.slice().sort((a, b) => a.sku.localeCompare(b.sku))) {
    const productLogs = logsByProduct.get(product.id) ?? [];

    const totalIn = productLogs
      .filter((l) => l.quantityChange > 0)
      .reduce((s, l) => s + l.quantityChange, 0);
    const totalOut = productLogs
      .filter((l) => l.quantityChange < 0)
      .reduce((s, l) => s + Math.abs(l.quantityChange), 0);

    const beginningBalance =
      productLogs.length > 0 ? productLogs[0].openingBalance : product.stock;
    const endingBalance =
      productLogs.length > 0
        ? productLogs[productLogs.length - 1].closingBalance
        : product.stock;

    rows.push({
      "SKU": product.sku,
      "Product Name": product.name,
      "Category": product.category,
      "Beginning Balance": beginningBalance,
      "Total In": totalIn,
      "Total Out": totalOut,
      "Ending Balance": endingBalance,
      "Unit Price ($)": product.price,
      "Stock Value ($)": Math.round(endingBalance * product.price * 100) / 100,
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 14 }, { wch: 35 }, { wch: 16 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
  const suffix = from ? `${from}_to_${to}` : `to_${to}`;
  XLSX.writeFile(wb, `inventory-report-${suffix}.xlsx`);
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [showRawLogDialog, setShowRawLogDialog] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params: Record<string, string | boolean> = {};
  if (debouncedSearch) params.search = debouncedSearch;
  if (category && category !== "all") params.category = category;
  if (lowStockOnly) params.lowStock = true;

  const { data: products, isLoading } = useListProducts(params);
  const { data: categories } = useListCategories();

  const handleRawLogDownload = async (from: string, to: string) => {
    setDownloading(true);
    try {
      await downloadRawLog(from, to);
      toast({ title: "Download complete", description: "Inventory ledger exported to Excel." });
      setShowRawLogDialog(false);
    } catch {
      toast({ variant: "destructive", title: "Download failed", description: "Could not export ledger." });
    } finally {
      setDownloading(false);
    }
  };

  const handleReportDownload = async (from: string, to: string) => {
    setDownloading(true);
    try {
      await downloadInventoryReport(from, to);
      toast({ title: "Download complete", description: "Inventory report exported to Excel." });
      setShowReportDialog(false);
    } catch {
      toast({ variant: "destructive", title: "Download failed", description: "Could not export report." });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Current stock levels for all products.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRawLogDialog(true)}
            data-testid="button-download-raw-log"
          >
            <Download className="w-4 h-4 mr-2" />
            Raw Ledger
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReportDialog(true)}
            data-testid="button-download-report"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Inventory Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or SKU..."
            className="pl-9 bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px] bg-background" data-testid="select-category">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <SelectValue placeholder="All Categories" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c.category} value={c.category}>
                  {c.category} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={lowStockOnly ? "destructive" : "outline"}
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className="bg-background"
            data-testid="button-low-stock-filter"
          >
            <AlertCircle className="w-4 h-4 mr-2" />
            Low Stock
          </Button>
        </div>
      </div>

      {/* Product table */}
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading products...</div>
        ) : (
          <ProductTable products={products || []} params={params} />
        )}
      </div>

      {/* Date range dialogs */}
      <DateRangeDialog
        open={showRawLogDialog}
        title="Download Raw Ledger"
        description="Select a date range for the inventory movement ledger. Each row represents one stock change event."
        onConfirm={handleRawLogDownload}
        onClose={() => setShowRawLogDialog(false)}
        loading={downloading}
      />
      <DateRangeDialog
        open={showReportDialog}
        title="Download Inventory Report"
        description="Select a date range. The report shows beginning balance, total in, total out, and ending balance per SKU."
        onConfirm={handleReportDownload}
        onClose={() => setShowReportDialog(false)}
        loading={downloading}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product table (read-only stock — editing happens via Stock In / Stock Out)
// ---------------------------------------------------------------------------

function ProductTable({
  products,
  params,
}: {
  products: Product[];
  params: Record<string, string | boolean>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteProduct = useDeleteProduct();
  const updateProduct = useUpdateProduct();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      try {
        await deleteProduct.mutateAsync({ id });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(params) });
        toast({ title: "Product deleted" });
      } catch {
        toast({ variant: "destructive", title: "Error", description: "Failed to delete product." });
      }
    }
  };

  const handleEditSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      await updateProduct.mutateAsync({
        id: editingProduct.id,
        data: {
          name: editingProduct.name,
          sku: editingProduct.sku,
          category: editingProduct.category,
          price: editingProduct.price,
          lowStockThreshold: editingProduct.lowStockThreshold,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(params) });
      toast({ title: "Product updated" });
      setEditingProduct(null);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update product." });
    }
  };

  if (products.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        No products found matching your criteria.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[300px]">Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-center">Stock</TableHead>
            <TableHead className="w-[80px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const isOutOfStock = product.stock === 0;
            const isLowStock = !isOutOfStock && product.stock < product.lowStockThreshold;
            return (
              <TableRow
                key={product.id}
                data-testid={`row-product-${product.id}`}
                className={`transition-colors ${isOutOfStock ? "bg-destructive/10 hover:bg-destructive/15" : ""} ${isLowStock ? "bg-orange-500/10 hover:bg-orange-500/15" : ""}`}
              >
                <TableCell>
                  <div className="font-medium text-foreground">{product.name}</div>
                  {product.description && (
                    <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                      {product.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-background/50 font-normal">
                    {product.category}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {product.sku}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(product.price)}
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className={`font-mono font-bold text-sm ${isOutOfStock ? "text-destructive" : ""} ${isLowStock ? "text-orange-500" : ""} ${!isOutOfStock && !isLowStock ? "text-foreground" : ""}`}
                    data-testid={`text-stock-${product.id}`}
                  >
                    {product.stock}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => setEditingProduct(product)}
                      data-testid={`button-edit-${product.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(product.id)}
                      data-testid={`button-delete-${product.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Edit product dialog — product metadata only, no stock field */}
      <Dialog
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleEditSave}>
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
              <DialogDescription>
                Update metadata for {editingProduct?.name}. To adjust stock, use Stock In / Stock Out.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editingProduct?.name || ""}
                  onChange={(e) =>
                    setEditingProduct((prev) => prev ? { ...prev, name: e.target.value } : null)
                  }
                  required
                  data-testid="input-edit-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-sku">SKU</Label>
                  <Input
                    id="edit-sku"
                    value={editingProduct?.sku || ""}
                    onChange={(e) =>
                      setEditingProduct((prev) => prev ? { ...prev, sku: e.target.value } : null)
                    }
                    required
                    data-testid="input-edit-sku"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-category">Category</Label>
                  <Input
                    id="edit-category"
                    value={editingProduct?.category || ""}
                    onChange={(e) =>
                      setEditingProduct((prev) => prev ? { ...prev, category: e.target.value } : null)
                    }
                    required
                    data-testid="input-edit-category"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-price">Price ($)</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    step="0.01"
                    value={editingProduct?.price || 0}
                    onChange={(e) =>
                      setEditingProduct((prev) =>
                        prev ? { ...prev, price: parseFloat(e.target.value) } : null
                      )
                    }
                    required
                    data-testid="input-edit-price"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-threshold">Low Stock Alert At</Label>
                  <Input
                    id="edit-threshold"
                    type="number"
                    value={editingProduct?.lowStockThreshold || 0}
                    onChange={(e) =>
                      setEditingProduct((prev) =>
                        prev ? { ...prev, lowStockThreshold: parseInt(e.target.value) } : null
                      )
                    }
                    required
                    data-testid="input-edit-threshold"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>
                Cancel
              </Button>
              <Button type="submit" data-testid="button-save-edit">
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
