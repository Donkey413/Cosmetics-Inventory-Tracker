import { useState, useRef, useEffect } from "react";
import { 
  useListProducts, 
  useListCategories, 
  useUpdateStock,
  getListProductsQueryKey,
  useDeleteProduct,
  useUpdateProduct,
  Product
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
import { Search, Filter, AlertCircle, Edit2, Trash2, Check, X, Plus, Minus } from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params: any = {};
  if (debouncedSearch) params.search = debouncedSearch;
  if (category && category !== "all") params.category = category;
  if (lowStockOnly) params.lowStock = true;

  const { data: products, isLoading } = useListProducts(params);
  const { data: categories } = useListCategories();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage and track your cosmetic product catalog.</p>
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
          />
        </div>
        
        <div className="flex gap-4 w-full sm:w-auto">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px] bg-background">
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

function ProductTable({ products, params }: { products: Product[], params: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateStock = useUpdateStock();
  const deleteProduct = useDeleteProduct();
  const updateProduct = useUpdateProduct();

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
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      toast({ title: "Stock updated", description: "The product stock has been updated successfully." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update stock." });
    }
    setEditingStockId(null);
  };

  const handleQuickAdjust = async (id: number, currentStock: number, delta: number) => {
    const newStock = Math.max(0, currentStock + delta);
    try {
      await updateStock.mutateAsync({ id, data: { stock: newStock } });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update stock." });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      try {
        await deleteProduct.mutateAsync({ id });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        toast({ title: "Product deleted" });
      } catch (e) {
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
          lowStockThreshold: editingProduct.lowStockThreshold
        }
      });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      toast({ title: "Product updated" });
      setEditingProduct(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update product." });
    }
  };

  if (products.length === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
        <Package className="w-12 h-12 mb-4 opacity-20" />
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
                className={`
                  transition-colors
                  ${isOutOfStock ? "bg-destructive/10 hover:bg-destructive/15" : ""}
                  ${isLowStock ? "bg-orange-500/10 hover:bg-orange-500/15" : ""}
                `}
              >
                <TableCell>
                  <div className="font-medium text-foreground">{product.name}</div>
                  {product.description && (
                    <div className="text-xs text-muted-foreground truncate max-w-[280px]">{product.description}</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-background/50 font-normal">
                    {product.category}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
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
                          if (e.key === 'Enter') handleStockSave(product.id);
                          if (e.key === 'Escape') setEditingStockId(null);
                        }}
                        onBlur={() => handleStockSave(product.id)}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-full hover:bg-background"
                        onClick={() => handleQuickAdjust(product.id, product.stock, -1)}
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
                      >
                        {product.stock}
                      </button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-full hover:bg-background"
                        onClick={() => handleQuickAdjust(product.id, product.stock, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditingProduct(product)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(product.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleEditSave}>
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
              <DialogDescription>
                Update the details for {editingProduct?.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input 
                  id="name" 
                  value={editingProduct?.name || ""} 
                  onChange={(e) => setEditingProduct(prev => prev ? {...prev, name: e.target.value} : null)} 
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input 
                    id="sku" 
                    value={editingProduct?.sku || ""} 
                    onChange={(e) => setEditingProduct(prev => prev ? {...prev, sku: e.target.value} : null)} 
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input 
                    id="category" 
                    value={editingProduct?.category || ""} 
                    onChange={(e) => setEditingProduct(prev => prev ? {...prev, category: e.target.value} : null)} 
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="price">Price</Label>
                  <Input 
                    id="price" 
                    type="number" 
                    step="0.01" 
                    value={editingProduct?.price || 0} 
                    onChange={(e) => setEditingProduct(prev => prev ? {...prev, price: parseFloat(e.target.value)} : null)} 
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="threshold">Low Stock Threshold</Label>
                  <Input 
                    id="threshold" 
                    type="number" 
                    value={editingProduct?.lowStockThreshold || 0} 
                    onChange={(e) => setEditingProduct(prev => prev ? {...prev, lowStockThreshold: parseInt(e.target.value)} : null)} 
                    required
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>Cancel</Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
