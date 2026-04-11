import { useState, useEffect } from "react";
import {
  useListProducts,
  useListCategories,
  useListLocations,
  useGetLocationStock,
  Product,
  LocationStockItem,
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
import { Search, Filter, AlertCircle, Download, FileSpreadsheet, MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [locationId, setLocationId] = useState<number | null>(null);
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

  const { data: products, isLoading: productsLoading } = useListProducts(params);
  const { data: categories } = useListCategories();
  const { data: locations } = useListLocations();
  const { data: locationStock, isLoading: locationStockLoading } = useGetLocationStock(
    locationId ?? 0,
    { query: { enabled: locationId !== null } },
  );

  const isLoading = locationId !== null ? locationStockLoading : productsLoading;

  const handleDownloadRawLog = async () => {
    setIsDownloadingLog(true);
    try {
      const token = localStorage.getItem("vela_auth_token");
      const res = await fetch("/api/inventory-logs", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch logs");
      const logs = await res.json();

      const XLSX = await import("xlsx");
      const rows = logs.map((log: {
        id: number;
        productName: string;
        productSku: string;
        productCategory: string;
        userName: string | null;
        locationCode: string | null;
        locationName: string | null;
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
        "Location": log.locationCode ? `${log.locationCode} — ${log.locationName}` : "—",
        "Movement Type": log.type,
        "Opening Balance": log.openingBalance,
        "Quantity Change": log.quantityChange,
        "Closing Balance": log.closingBalance,
        "Notes": log.notes ?? "",
        "Timestamp": new Date(log.createdAt).toLocaleString(),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 8 }, { wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 20 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 22 },
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
      const token = localStorage.getItem("vela_auth_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [logsRes, productsRes] = await Promise.all([
        fetch("/api/inventory-logs", { headers }),
        fetch("/api/products", { headers }),
      ]);
      if (!logsRes.ok || !productsRes.ok) throw new Error("Failed to fetch data");

      const logs: {
        id: number;
        productId: number;
        productName: string;
        productSku: string;
        productCategory: string;
        locationCode: string | null;
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
            "Location": "",
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
            "Location": log.locationCode ?? "—",
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
          "Location": "",
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
        { wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 22 },
        { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 30 },
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

  // Merge location stock into a displayable format
  const locationStockMap = new Map<number, number>(
    locationStock?.map((item) => [item.productId, item.locationStock]) ?? [],
  );

  // Build rows for display
  const displayRows: Array<{
    id: number;
    name: string;
    sku: string;
    categoryName: string;
    unitOfMeasure: string;
    price: number;
    stock: number;
    lowStockThreshold: number;
    description?: string | null;
  }> = locationId !== null
    ? (locationStock ?? [])
        .filter((item) => {
          if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            if (!item.productName.toLowerCase().includes(q) && !item.productSku.toLowerCase().includes(q)) return false;
          }
          if (category !== "all" && item.categoryName !== category) return false;
          if (lowStockOnly && item.locationStock >= item.lowStockThreshold) return false;
          return true;
        })
        .map((item) => ({
          id: item.productId,
          name: item.productName,
          sku: item.productSku,
          categoryName: item.categoryName,
          unitOfMeasure: item.unitOfMeasure,
          price: item.price,
          stock: item.locationStock,
          lowStockThreshold: item.lowStockThreshold,
        }))
    : (products ?? []).map((p) => ({ ...p }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {locationId !== null
              ? `Showing stock at: ${locations?.find((l) => l.id === locationId)?.name ?? "selected location"}`
              : "Global stock across all locations."}
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

      <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center bg-card p-4 rounded-lg border border-border shadow-sm flex-wrap">
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

        <div className="flex gap-3 flex-wrap w-full sm:w-auto">
          {/* Location filter */}
          <Select
            value={locationId !== null ? String(locationId) : "all"}
            onValueChange={(v) => setLocationId(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-[180px] bg-background" data-testid="select-location">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <SelectValue placeholder="All Locations" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations (Global)</SelectItem>
              {locations?.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  <span className="font-mono text-xs mr-1 text-muted-foreground">{l.code}</span>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : displayRows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
            <div className="w-12 h-12 mb-4 opacity-20 border-2 border-current rounded flex items-center justify-center text-2xl">
              ?
            </div>
            <p>No products found matching your criteria.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[300px]">Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>UoM</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-center">
                  {locationId !== null ? "Location Stock" : "Global Stock"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((product) => {
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
                      {"description" in product && product.description && (
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
                      <span
                        className={`font-mono font-bold text-sm px-2 py-1 rounded min-w-[3rem] inline-block
                          ${isOutOfStock ? "text-destructive" : ""}
                          ${isLowStock ? "text-orange-500" : ""}
                          ${!isOutOfStock && !isLowStock ? "text-foreground" : ""}
                        `}
                        data-testid={`text-stock-${product.id}`}
                      >
                        {product.stock}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
