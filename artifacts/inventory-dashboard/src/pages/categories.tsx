import { useState } from "react";
import {
  useListCategoryEntities,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  getListCategoryEntitiesQueryKey,
  getListCategoriesQueryKey,
  CategoryEntity,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tag, PlusCircle, Trash2, Edit2, Loader2 } from "lucide-react";

function apiErrMsg(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as { data?: { error?: string }; message?: string };
    if (e.data?.error) return e.data.error;
    if (e.message) return e.message;
  }
  return fallback;
}

export default function CategoriesPage() {
  const { data: categories, isLoading } = useListCategoryEntities();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryEntity | null>(null);
  const [newCat, setNewCat] = useState({ name: "", skuPrefix: "" });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCategoryEntitiesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  };

  const handleCreate = async () => {
    if (!newCat.name || !newCat.skuPrefix) {
      toast({ variant: "destructive", title: "Name and SKU prefix are required." });
      return;
    }
    try {
      await createCategory.mutateAsync({ name: newCat.name, skuPrefix: newCat.skuPrefix });
      invalidate();
      toast({ title: "Category created." });
      setShowCreateDialog(false);
      setNewCat({ name: "", skuPrefix: "" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to create category.", description: apiErrMsg(err, "Name or SKU prefix may already exist.") });
    }
  };

  const handleUpdate = async () => {
    if (!editingCategory) return;
    try {
      await updateCategory.mutateAsync({
        id: editingCategory.id,
        data: { name: editingCategory.name, skuPrefix: editingCategory.skuPrefix },
      });
      invalidate();
      toast({ title: "Category updated." });
      setEditingCategory(null);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to update category.", description: apiErrMsg(err, "Could not update category.") });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete category "${name}"? Only possible if it has no products.`)) return;
    try {
      await deleteCategory.mutateAsync({ id });
      invalidate();
      toast({ title: "Category deleted." });
    } catch (err) {
      toast({ variant: "destructive", title: "Cannot delete category.", description: apiErrMsg(err, "Remove all products in this category first.") });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center">
          <Tag className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground text-sm">Manage product categories and SKU prefixes.</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{categories?.length ?? 0} category(ies)</p>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <PlusCircle className="w-4 h-4 mr-2" />
          New Category
        </Button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Category Name</TableHead>
                <TableHead>SKU Prefix</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(categories ?? []).map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {cat.skuPrefix}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(cat.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setEditingCategory({ ...cat })}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(cat.id, cat.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {categories?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No categories yet. Create one to start adding products.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input
                value={newCat.name}
                onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))}
                placeholder="e.g. Lipstick"
              />
            </div>
            <div className="space-y-2">
              <Label>SKU Prefix</Label>
              <Input
                value={newCat.skuPrefix}
                onChange={(e) => setNewCat((c) => ({ ...c, skuPrefix: e.target.value.toUpperCase() }))}
                placeholder="e.g. LIP"
                className="font-mono uppercase"
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">
                Products will get SKUs like <span className="font-mono">{newCat.skuPrefix || "PREFIX"}0000000001</span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createCategory.isPending}>
              {createCategory.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Category Name</Label>
                <Input
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory((c) => c ? { ...c, name: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>SKU Prefix</Label>
                <Input
                  value={editingCategory.skuPrefix}
                  onChange={(e) => setEditingCategory((c) => c ? { ...c, skuPrefix: e.target.value.toUpperCase() } : null)}
                  className="font-mono uppercase"
                  maxLength={10}
                />
                <p className="text-xs text-muted-foreground">
                  Changing the prefix will not rename existing SKUs — only new products will use the updated prefix.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategory(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateCategory.isPending}>
              {updateCategory.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
</content>
</invoke>