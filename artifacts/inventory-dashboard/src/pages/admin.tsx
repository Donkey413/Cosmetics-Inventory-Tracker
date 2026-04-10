import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useListCategoryEntities,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  getListUsersQueryKey,
  getListCategoryEntitiesQueryKey,
  getListCategoriesQueryKey,
  UserRecord,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Tag, PlusCircle, Trash2, Edit2, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function apiErrMsg(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as { data?: { error?: string }; message?: string };
    if (e.data?.error) return e.data.error;
    if (e.message) return e.message;
  }
  return fallback;
}

const ALL_PERMISSIONS = [
  { key: "can_view_dashboard", label: "View Dashboard" },
  { key: "can_manage_products", label: "Manage Products (add/edit/delete)" },
  { key: "can_stock_in_out", label: "Stock In / Out" },
  { key: "can_view_reports", label: "View Reports & Export" },
  { key: "can_batch_upload", label: "Batch Upload / Import" },
  { key: "can_manage_categories", label: "Manage Categories" },
  { key: "can_manage_users", label: "Manage Users" },
];

// ---------------------------------------------------------------------------
// Users Tab
// ---------------------------------------------------------------------------

type EditingUser = UserRecord & { newPassword: string };

function UsersTab() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useListUsers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [newUser, setNewUser] = useState({
    username: "", email: "", password: "", isAdmin: false, permissions: [] as string[],
  });

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) {
      toast({ variant: "destructive", title: "All fields are required." });
      return;
    }
    try {
      await createUser.mutateAsync({
        username: newUser.username,
        email: newUser.email,
        password: newUser.password,
        isAdmin: newUser.isAdmin,
        permissions: newUser.permissions,
      });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User created successfully." });
      setShowCreateDialog(false);
      setNewUser({ username: "", email: "", password: "", isAdmin: false, permissions: [] });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to create user.", description: apiErrMsg(err, "Could not create user.") });
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    try {
      const payload: Record<string, unknown> = {
        username: editingUser.username,
        email: editingUser.email,
        isAdmin: editingUser.isAdmin,
        permissions: editingUser.isAdmin ? [] : editingUser.permissions,
      };
      if (editingUser.newPassword) payload.password = editingUser.newPassword;

      await updateUser.mutateAsync({ id: editingUser.id, data: payload });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User updated." });
      setEditingUser(null);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to update user.", description: apiErrMsg(err, "Could not update user.") });
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await deleteUser.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User deleted." });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete user.", description: apiErrMsg(err, "Could not delete user.") });
    }
  };

  const togglePermission = (perms: string[], key: string): string[] =>
    perms.includes(key) ? perms.filter((p) => p !== key) : [...perms, key];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{users?.length ?? 0} user(s)</p>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <PlusCircle className="w-4 h-4 mr-2" />
          New User
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
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.username}
                    {u.id === currentUser?.id && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                  <TableCell>
                    {u.isAdmin ? (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">User</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.isAdmin ? (
                      <span className="text-xs text-muted-foreground">All permissions</span>
                    ) : u.permissions.length === 0 ? (
                      <span className="text-xs text-destructive">No permissions</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{u.permissions.length} assigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => setEditingUser({ ...u, permissions: [...u.permissions], newPassword: "" })}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteUser(u.id, u.username)}
                        disabled={u.id === currentUser?.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create user dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={newUser.username}
                onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
                placeholder="e.g. jane_doe"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                placeholder="Min. 8 characters"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="new-user-admin"
                checked={newUser.isAdmin}
                onCheckedChange={(checked) => setNewUser((u) => ({ ...u, isAdmin: !!checked, permissions: [] }))}
              />
              <label htmlFor="new-user-admin" className="text-sm cursor-pointer">
                Grant Admin (all permissions)
              </label>
            </div>

            {!newUser.isAdmin && (
              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="space-y-2 border border-border rounded-md p-3">
                  {ALL_PERMISSIONS.map((p) => (
                    <div key={p.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`new-perm-${p.key}`}
                        checked={newUser.permissions.includes(p.key)}
                        onCheckedChange={() =>
                          setNewUser((u) => ({ ...u, permissions: togglePermission(u.permissions, p.key) }))
                        }
                      />
                      <label htmlFor={`new-perm-${p.key}`} className="text-sm cursor-pointer">
                        {p.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={createUser.isPending}>
              {createUser.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog — full credentials + role + permissions */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              Edit User — {editingUser?.username}
              {editingUser?.id === currentUser?.id && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">(your account)</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  value={editingUser.username}
                  onChange={(e) => setEditingUser((u) => u ? { ...u, username: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser((u) => u ? { ...u, email: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
                <Input
                  type="password"
                  value={editingUser.newPassword}
                  onChange={(e) => setEditingUser((u) => u ? { ...u, newPassword: e.target.value } : null)}
                  placeholder="Min. 8 characters"
                />
              </div>

              <div className="pt-2 border-t border-border space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-admin"
                    checked={editingUser.isAdmin}
                    onCheckedChange={(checked) =>
                      setEditingUser((u) => u ? { ...u, isAdmin: !!checked, permissions: [] } : null)
                    }
                  />
                  <label htmlFor="edit-admin" className="text-sm cursor-pointer font-medium">
                    Admin (full access to everything)
                  </label>
                </div>

                {!editingUser.isAdmin && (
                  <div className="space-y-2">
                    <Label>Permissions</Label>
                    <div className="space-y-2 border border-border rounded-md p-3">
                      {ALL_PERMISSIONS.map((p) => (
                        <div key={p.key} className="flex items-center gap-2">
                          <Checkbox
                            id={`edit-perm-${p.key}`}
                            checked={editingUser.permissions.includes(p.key)}
                            onCheckedChange={() =>
                              setEditingUser((u) =>
                                u ? { ...u, permissions: togglePermission(u.permissions, p.key) } : null
                              )
                            }
                          />
                          <label htmlFor={`edit-perm-${p.key}`} className="text-sm cursor-pointer">
                            {p.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleSaveUser} disabled={updateUser.isPending}>
              {updateUser.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categories Tab
// ---------------------------------------------------------------------------

function CategoriesTab() {
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
    <div className="space-y-4">
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
                Products in this category will get SKUs like <span className="font-mono">{newCat.skuPrefix || "PREFIX"}0000000001</span>
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

// ---------------------------------------------------------------------------
// Admin Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Admin Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage users, permissions, and product categories.
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            Users & Permissions
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-2">
            <Tag className="w-4 h-4" />
            Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoriesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
