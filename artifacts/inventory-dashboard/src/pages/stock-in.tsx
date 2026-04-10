import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateStockMovement, useListProducts, getListProductsQueryKey, getGetInventorySummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownToLine, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  productId: z.coerce.number().min(1, "Please select a product."),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1."),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function StockIn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMovement = useCreateStockMovement();
  const { data: products } = useListProducts();
  const [lastEntry, setLastEntry] = useState<{ productName: string; quantity: number } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: 0,
      quantity: 1,
      notes: "",
    },
  });

  const selectedProductId = form.watch("productId");
  const selectedProduct = products?.find((p) => p.id === Number(selectedProductId));

  const onSubmit = async (values: FormValues) => {
    try {
      await createMovement.mutateAsync({
        data: {
          productId: values.productId,
          type: "in",
          quantity: values.quantity,
          notes: values.notes || null,
        },
      });

      const productName = selectedProduct?.name ?? "Product";
      setLastEntry({ productName, quantity: values.quantity });

      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInventorySummaryQueryKey() });

      toast({ title: "Stock added", description: `+${values.quantity} units recorded for ${productName}.` });

      form.reset({ productId: 0, quantity: 1, notes: "" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to record stock movement.";
      toast({ variant: "destructive", title: "Error", description: message });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-green-500/15 flex items-center justify-center">
          <ArrowDownToLine className="w-5 h-5 text-green-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stock In</h2>
          <p className="text-muted-foreground text-sm">Record inventory received into stock.</p>
        </div>
      </div>

      {lastEntry && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-sm text-green-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>Added <strong>+{lastEntry.quantity}</strong> units to <strong>{lastEntry.productName}</strong> — logged successfully.</span>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product (SKU)</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ? String(field.value) : ""}
                    >
                      <SelectTrigger data-testid="select-product-in">
                        <SelectValue placeholder="Select a product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {products
                          ?.slice()
                          .sort((a, b) => a.sku.localeCompare(b.sku))
                          .map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              <span className="font-mono text-xs mr-2 text-muted-foreground">{p.sku}</span>
                              {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedProduct && (
              <div className="flex items-center gap-4 p-3 bg-background rounded-md border border-border text-sm">
                <div>
                  <span className="text-muted-foreground">Current stock:</span>{" "}
                  <span className={`font-mono font-semibold ${selectedProduct.stock === 0 ? "text-destructive" : selectedProduct.stock < selectedProduct.lowStockThreshold ? "text-orange-400" : "text-foreground"}`}>
                    {selectedProduct.stock} units
                  </span>
                </div>
                <div className="w-px h-4 bg-border" />
                <Badge variant="outline" className="text-xs">{selectedProduct.categoryName}</Badge>
              </div>
            )}

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity to Add</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      className="font-mono w-40"
                      {...field}
                      data-testid="input-quantity-in"
                    />
                  </FormControl>
                  <FormDescription>Number of units being received into stock.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Purchase order #1042, supplier delivery..."
                      className="resize-none h-20"
                      {...field}
                      data-testid="input-notes-in"
                    />
                  </FormControl>
                  <FormDescription>Visible in the raw inventory log export.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={createMovement.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-submit-stock-in"
              >
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                {createMovement.isPending ? "Recording..." : "Record Stock In"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
