import { useState, useRef, useEffect } from "react";
import {
  useListProducts,
  useListCategories,
  useListCategoryEntities,
  useUpdateStock,
  getListProductsQueryKey,
  useDeleteProduct,
  useUpdateProduct,
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
import { Search, Filter, AlertCircle, Edit2, Trash2, Plus, Minus, Download, FileSpreadsheet } from "lucide-react";
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

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isDownloadingLog, setIsDownloadingLog] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
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

  const handleDownloadRawLog = async () => {
    setIsDownloadingLog(true);
    try {
      const res = await fetch("/api/inventory-logs");
      if (!res.ok) throw new Error("Failed to fetch logs");
      const logs = await res.json();

      const XLSX = await import("xlsx");
      const rows = logs.map((log: {
        id: number;
        productName: string;
        productSku: string;
        productCategory: string;
        userName: string | null;
        type: string;
        openingBalance: number;
        quantityChange: number;
        closingBalance: number;
        notes: string | null;
        createdAt: string;
      }) => ({
        "Log ID": log.id,
        "Product Name": log.productName,
        "SKU": log.productSku,
        "Category": log.productCategory,
        "User": log.userName ?? "—",
        "Movement Type": log.type,
        "Opening Balance": log.openingBalance,
        "Quantity Change": log.quantityChange,
        "Closing Balance": log.closingBalance,
        "Notes": log.notes ?? "",
        "Timestamp": new Date(log.createdAt).toLocaleString(),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 8 }, { wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory Log");
      XLSX.writeFile(wb, `inventory-raw-log-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "Download complete", description: "Raw inventory log exported to Excel." });
    } catch {
      toast({ variant: "destructive", title: "Download failed", description: "Could not export inventory log." });
    } finally {
      setIsDownloadingLog(false);
    }
  };

  const handleDownloadReport = async () => {
    setIsDownloadingReport(true);
    try {
      const [logsRes, productsRes] = await Promise.all([
        fetch("/api/inventory-logs"),
        fetch("/api/products"),
      ]);
      if (!logsRes.ok || !productsRes.ok) throw new Error("Failed to fetch data");

      const logs: {
        id: number;
        productId: number;
        productName: string;
        productSku: string;
        productCategory: string;
        type: string;
        openingBalance: number;
        quantityChange: number;
        closingBalance: number;
        notes: string | null;
        createdAt: string;
      }[] = await logsRes.json();

      const allProducts: Product[] = await productsRes.json();

      const logsByProduct = new Map<number, typeof logs>();
      for (const log of logs) {
        if (!logsByProduct.has(log.productId)) logsByProduct.set(log.productId, []);
        logsByProduct.get(log.productId)!.push(log);
      }

      const reportRows: object[] = [];

      for (const product of allProducts) {
        const productLogs = (logsByProduct.get(product.id) ?? []).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        if (productLogs.length === 0) {
          reportRows.push({
            "Product Name": product.name,
            "SKU": product.sku,
            "Category": product.categoryName,
            "UoM": product.unitOfMeasure,
            "Date / Time": "",
            "Movement Type": "No movements recorded",
            "Opening Balance": 0,
            "In (Qty)": "",
            "Out (Qty)": "",
            "Ending Balance": product.stock,
            "Notes": "",
          });
          continue;
        }

        for (const log of productLogs) {
          const isIn = log.quantityChange > 0;
          const isOut = log.quantityChange < 0;
          reportRows.push({
            "Product Name": log.productName,
            "SKU": log.productSku,
            "Category": log.productCategory,
            "UoM": product.unitOfMeasure,
            "Date / Time": new Date(log.createdAt).toLocaleString(),
            "Movement Type": log.type.charAt(0).toUpperCase() + log.type.slice(1),
            "Opening Balance": log.openingBalance,
            "In (Qty)": isIn ? log.quantityChange : "",
            "Out (Qty)": isOut ? Math.abs(log.quantityChange) : "",
            "Ending Balance": log.closingBalance,
            "Notes": log.notes ?? "",
          });
        }

        const totalIn = productLogs.filter((l) => l.quantityChange > 0).reduce((s, l) => s + l.quantityChange, 0);
        const totalOut = productLogs.filter((l) => l.quantityChange < 0).reduce((s, l) => s + Math.abs(l.quantityChange), 0);
        const firstLog = productLogs[0];
        const lastLog = productLogs[productLogs.length - 1];

        reportRows.push({
          "Product Name": `TOTAL — ${product.name}`,
          "SKU": product.sku,
          "Category": product.categoryName,
          "UoM": product.unitOfMeasure,
          "Date / Time": "",
          "Movement Type": "SUMMARY",
          "Opening Balance": firstLog.openingBalance,
          "In (Qty)": totalIn,
          "Out (Qty)": totalOut,
          "Ending Balance": lastLog.closingBalance,
          "Notes": "",
        });
        reportRows.push({});
      }

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(reportRows);
      ws["!cols"] = [
        { wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 22 }, { wch: 16 },
        { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
      XLSX.writeFile(wb, `inventory-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "Download complete", description: "Inventory report exported to Excel." });
    } catch {
      toast({ variant: "destructive", title: "Download failed", description: "Could not export inventory report." });
    } finally {
      setIsDownloadingReport(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage and track your cosmetic product catalog.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadRawLog}
            disabled={isDownloadingLog}
            data-testid="button-download-raw-log"
          >
            <Download className="w-4 h-4 mr-2" />
            {isDownloadingLog ? "Exporting..." : "Raw Log"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadReport}
            disabled={isDownloadingReport}
            data-testid="button-download-report"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            {isDownloadingReport ? "Exporting..." : "Inventory Report"}
          </Button>
        </div>
      </div>

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
                <SelectItem key={c.categoryId} value={c.category}>
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

      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading products...</div>
        ) : (
          <ProductTable products={products || []} params={params} />
        )}
      </div>
    </div>
  );
}

function ProductTable({
  products,
  params,
}: {
  products: Product[];
  params: Record<string, string | boolean>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateStock = useUpdateStock();
  const deleteProduct = useDeleteProduct();
  const updateProduct = useUpdateProduct();
  const { data: categoryEntities } = useListCategoryEntities();

  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [stockValue, setStockValue] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (editingStockId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingStockId]);

  const handleStockSave = async (id: number) => {
    if (stockValue < 0) return;
    try {
      await updateStock.mutateAsync({ id, data: { stock: stockValue } });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(params) });
      toast({ title: "Stock updated", description: "Stock adjustment recorded in ledger." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update stock." });
    }
    setEditingStockId(null);
  };

  const handleQuickAdjust = async (id: number, currentStock: number, delta: number) => {
    const newStock = Math.max(0, currentStock + delta);
    try {
      await updateStock.mutateAsync({ id, data: { stock: newStock } });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(params) });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update stock." });
    }
  };

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
          categoryId: editingProduct.categoryId,
          price: editingProduct.price,
          unitOfMeasure: editingProduct.unitOfMeasure,
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
      <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
        <div className="w-12 h-12 mb-4 opacity-20 border-2 border-current rounded flex items-center justify-center text-2xl">
          ?
        </div>
        <p>No products found matching your criteria.</p>
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
            <TableHead>UoM</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-center">Stock</TableHead>
            <TableHead className="w-[100px] text-right">Actions</TableHead>
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
                className={`
                  transition-colors
                  ${isOutOfStock ? "bg-destructive/10 hover:bg-destructive/15" : ""}
                  ${isLowStock ? "bg-orange-500/10 hover:bg-orange-500/15" : ""}
                `}
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
                    {product.categoryName}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{product.unitOfMeasure}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(product.price)}</TableCell>
                <TableCell className="text-center">
                  {editingStockId === product.id ? (
                    <div className="flex items-center justify-center gap-1">
                      <Input
                        ref={inputRef}
                        type="number"
                        min="0"
                        className="w-16 h-8 text-center font-mono p-1"
                        value={stockValue}
                        onChange={(e) => setStockValue(parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleStockSave(product.id);
                          if (e.key === "Escape") setEditingStockId(null);
                        }}
                        onBlur={() => handleStockSave(product.id)}
                        data-testid={`input-stock-${product.id}`}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full hover:bg-background"
                        onClick={() => handleQuickAdjust(product.id, product.stock, -1)}
                        data-testid={`button-decrease-stock-${product.id}`}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <button
                        className={`
                          font-mono font-bold text-sm px-2 py-1 rounded min-w-[3rem] hover:bg-background transition-colors
                          ${isOutOfStock ? "text-destructive" : ""}
                          ${isLowStock ? "text-orange-500" : ""}
                          ${!isOutOfStock && !isLowStock ? "text-foreground" : ""}
                        `}
                        onClick={() => {
                          setStockValue(product.stock);
                          setEditingStockId(product.id);
                        }}
                        data-testid={`text-stock-${product.id}`}
                      >
                        {product.stock}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full hover:bg-background"
                        onClick={() => handleQuickAdjust(product.id, product.stock, 1)}
                        data-testid={`button-increase-stock-${product.id}`}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
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

      {/* Edit product dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleEditSave}>
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
              <DialogDescription>Update the details for {editingProduct?.name}.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editingProduct?.name || ""}
                  onChange={(e) =>
                    setEditingProduct((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  required
                  data-testid="input-edit-name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-category">Category</Label>
                <Select
                  value={editingProduct?.categoryId ? String(editingProduct.categoryId) : ""}
                  onValueChange={(val) =>
                    setEditingProduct((prev) => {
                      if (!prev) return null;
                      const cat = categoryEntities?.find((c) => c.id === Number(val));
                      return { ...prev, categoryId: Number(val), categoryName: cat?.name ?? prev.categoryName };
                    })
                  }
                >
                  <SelectTrigger id="edit-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryEntities?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>SKU (auto-generated, read-only)</Label>
                <Input value={editingProduct?.sku || ""} disabled className="font-mono text-xs opacity-60" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="price">Price</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={editingProduct?.price || 0}
                    onChange={(e) =>
                      setEditingProduct((prev) =>
                        prev ? { ...prev, price: parseFloat(e.target.value) } : null,
                      )
                    }
                    required
                    data-testid="input-edit-price"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="uom">Unit of Measure</Label>
                  <Input
                    id="uom"
                    value={editingProduct?.unitOfMeasure || ""}
                    onChange={(e) =>
                      setEditingProduct((prev) =>
                        prev ? { ...prev, unitOfMeasure: e.target.value } : null,
                      )
                    }
                    data-testid="input-edit-uom"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="threshold">Low Stock Threshold</Label>
                <Input
                  id="threshold"
                  type="number"
                  value={editingProduct?.lowStockThreshold || 0}
                  onChange={(e) =>
                    setEditingProduct((prev) =>
                      prev ? { ...prev, lowStockThreshold: parseInt(e.target.value) } : null,
                    )
                  }
                  required
                  data-testid="input-edit-threshold"
                />
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
