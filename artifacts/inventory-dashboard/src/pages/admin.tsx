import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useKickUser,
  useGetSettings,
  useUpdateSettings,
  getListUsersQueryKey,
  getGetSettingsQueryKey,
  UserRecord,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Settings, PlusCircle, Trash2, Edit2, ShieldCheck, Loader2, Wifi, WifiOff } from "lucide-react";
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

function isOnline(lastActiveAt: string | null, sessionTimeoutMinutes: number): boolean {
  if (!lastActiveAt) return false;
  const msSinceActive = Date.now() - new Date(lastActiveAt).getTime();
  return msSinceActive < sessionTimeoutMinutes * 60 * 1000;
}

function UsersTab({ sessionTimeoutMinutes }: { sessionTimeoutMinutes: number }) {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useListUsers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const kickUser = useKickUser();

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

  const handleKick = async (id: number, username: string) => {
    if (!confirm(`Force-logout "${username}"? Their active session will be terminated immediately.`)) return;
    try {
      await kickUser.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: `Session for "${username}" terminated.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to kick user.", description: apiErrMsg(err, "Could not terminate session.") });
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => {
                const online = isOnline(u.lastActiveAt, sessionTimeoutMinutes);
                return (
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
                    <TableCell>
                      {online ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <Wifi className="w-3 h-3" /> Online
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <WifiOff className="w-3 h-3" /> Offline
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {u.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-400/10"
                            onClick={() => handleKick(u.id, u.username)}
                            disabled={kickUser.isPending || !online}
                            title={!online ? "User is already offline" : "Force-logout this user"}
                          >
                            Kick
                          </Button>
                        )}
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
                );
              })}
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

      {/* Edit user dialog */}
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
// System Settings Tab
// ---------------------------------------------------------------------------

function SystemSettingsTab() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [appName, setAppName] = useState<string | null>(null);
  const [sessionTimeout, setSessionTimeout] = useState<number | null>(null);
  const [costingMethod, setCostingMethod] = useState<"manual" | "weighted_average" | null>(null);

  // Use loaded values as initial state (only set once)
  const displayAppName = appName !== null ? appName : (settings?.appName ?? "");
  const displayTimeout = sessionTimeout !== null ? sessionTimeout : (settings?.sessionTimeoutMinutes ?? 5);
  const displayCostingMethod = costingMethod !== null ? costingMethod : (settings?.costingMethod ?? "manual");

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        appName: displayAppName,
        sessionTimeoutMinutes: Number(displayTimeout),
        costingMethod: displayCostingMethod,
      });
      queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Settings saved." });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to save settings.", description: apiErrMsg(err, "Could not update settings.") });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-4 bg-card border border-border rounded-lg p-6">
        <div className="space-y-2">
          <Label htmlFor="app-name">Application Name</Label>
          <Input
            id="app-name"
            value={displayAppName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="e.g. Vela Inventory"
          />
          <p className="text-xs text-muted-foreground">Displayed in the sidebar header.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
          <Input
            id="session-timeout"
            type="number"
            min={1}
            max={1440}
            value={displayTimeout}
            onChange={(e) => setSessionTimeout(Number(e.target.value))}
            className="w-32 font-mono"
          />
          <p className="text-xs text-muted-foreground">
            How long a user session stays active without a heartbeat. Users cannot log in from another device until this window expires or an admin kicks the session.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="costing-method">Inventory Costing Method</Label>
          <Select
            value={displayCostingMethod}
            onValueChange={(v) => setCostingMethod(v as "manual" | "weighted_average")}
          >
            <SelectTrigger id="costing-method" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual Price (fixed per product)</SelectItem>
              <SelectItem value="weighted_average">Weighted Average Cost</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            <strong>Manual:</strong> Product price is fixed and only changes when you edit it directly.{" "}
            <strong>Weighted Average:</strong> Each stock-in with a unit cost automatically recalculates the product's average cost.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { data: settings } = useGetSettings();
  const sessionTimeoutMinutes = settings?.sessionTimeoutMinutes ?? 5;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Admin Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage users, permissions, and system configuration.
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            Users & Permissions
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4" />
            System Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTab sessionTimeoutMinutes={sessionTimeoutMinutes} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SystemSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
