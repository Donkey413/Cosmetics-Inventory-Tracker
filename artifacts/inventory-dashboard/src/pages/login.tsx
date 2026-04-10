import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, useSetupAdmin, useCheckSetupStatus } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
});

const setupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const { data: setupStatus, isLoading: checkingSetup } = useCheckSetupStatus();
  const needsSetup = setupStatus?.needsSetup ?? false;

  const loginMutation = useLogin();
  const setupMutation = useSetupAdmin();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const setupForm = useForm<z.infer<typeof setupSchema>>({
    resolver: zodResolver(setupSchema),
    defaultValues: { username: "", email: "", password: "", confirmPassword: "" },
  });

  const [showSetup, setShowSetup] = useState(false);

  const onLogin = async (values: z.infer<typeof loginSchema>) => {
    try {
      const res = await loginMutation.mutateAsync({ username: values.username, password: values.password });
      login(res.token, res.user);
    } catch {
      toast({ variant: "destructive", title: "Login failed", description: "Invalid username or password." });
    }
  };

  const onSetup = async (values: z.infer<typeof setupSchema>) => {
    try {
      const res = await setupMutation.mutateAsync({
        username: values.username,
        email: values.email,
        password: values.password,
      });
      login(res.token, res.user);
      toast({ title: "Admin account created", description: `Welcome, ${res.user.username}!` });
    } catch {
      toast({ variant: "destructive", title: "Setup failed", description: "Could not create admin account." });
    }
  };

  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center dark">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSetupMode = needsSetup || showSetup;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center dark">
      <div className="w-full max-w-md space-y-8 px-4">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
            <Package className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Vela Inventory</h1>
            <p className="text-sm text-muted-foreground">Cosmetics Catalog</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
          {isSetupMode ? (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold">Create Admin Account</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  No users exist yet. Set up your administrator account to get started.
                </p>
              </div>
              <form onSubmit={setupForm.handleSubmit(onSetup)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="setup-username">Username</Label>
                  <Input
                    id="setup-username"
                    placeholder="admin"
                    {...setupForm.register("username")}
                    data-testid="input-setup-username"
                  />
                  {setupForm.formState.errors.username && (
                    <p className="text-xs text-destructive">{setupForm.formState.errors.username.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-email">Email</Label>
                  <Input
                    id="setup-email"
                    type="email"
                    placeholder="admin@example.com"
                    {...setupForm.register("email")}
                    data-testid="input-setup-email"
                  />
                  {setupForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{setupForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-password">Password</Label>
                  <Input
                    id="setup-password"
                    type="password"
                    placeholder="Min. 8 characters"
                    {...setupForm.register("password")}
                    data-testid="input-setup-password"
                  />
                  {setupForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{setupForm.formState.errors.password.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-confirm">Confirm Password</Label>
                  <Input
                    id="setup-confirm"
                    type="password"
                    placeholder="Repeat password"
                    {...setupForm.register("confirmPassword")}
                    data-testid="input-setup-confirm"
                  />
                  {setupForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{setupForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={setupMutation.isPending}>
                  {setupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Admin Account
                </Button>
                {!needsSetup && (
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setShowSetup(false)}>
                    Back to Login
                  </Button>
                )}
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold">Sign In</h2>
                <p className="text-sm text-muted-foreground mt-1">Enter your credentials to access the system.</p>
                <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
                  Default admin: <span className="font-mono text-foreground">admin</span> /{" "}
                  <span className="font-mono text-foreground">admin1234</span>
                </div>
              </div>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="Enter username"
                    {...loginForm.register("username")}
                    data-testid="input-username"
                  />
                  {loginForm.formState.errors.username && (
                    <p className="text-xs text-destructive">{loginForm.formState.errors.username.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    {...loginForm.register("password")}
                    data-testid="input-password"
                  />
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Sign In
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Vela Inventory Management · v2.0.0
        </p>
      </div>
    </div>
  );
}
