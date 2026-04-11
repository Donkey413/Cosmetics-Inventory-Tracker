import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateStockMovement, useListProducts, useListLocations, useGetSettings, getListProductsQueryKey, getGetInventorySummaryQueryKey } from "@workspace/api-client-react";
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
  locationId: z.coerce.number().min(1, "Please select a location."),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1."),
  unitCost: z.coerce.number().min(0.01, "Must be greater than 0.").optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function StockIn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMovement = useCreateStockMovement();
  const { data: products } = useListProducts();
  const { data: locations } = useListLocations();
  const { data: settings } = useGetSettings();
  const isWeightedAverage = settings?.costingMethod === "weighted_average";
  const [lastEntry, setLastEntry] = useState<{ productName: string; quantity: number; locationName: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: 0,
      locationId: 0,
      quantity: 1,
      unitCost: undefined,
      notes: "",
    },
  });

  const selectedProductId = form.watch("productId");
  const selectedLocationId = form.watch("locationId");
  const selectedProduct = products?.find((p) => p.id === Number(selectedProductId));
  const selectedLocation = locations?.find((l) => l.id === Number(selectedLocationId));

  const onSubmit = async (values: FormValues) => {
    try {
      await createMovement.mutateAsync({
        data: {
          productId: values.productId,
          locationId: values.locationId,
          type: "in",
          quantity: values.quantity,
          notes: values.notes || null,
          ...(values.unitCost !== undefined ? { unitCost: values.unitCost } : {}),
        },
      });

      const productName = selectedProduct?.name ?? "Product";
      const locationName = selectedLocation?.name ?? "location";
      setLastEntry({ productName, quantity: values.quantity, locationName });

      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInventorySummaryQueryKey() });

      toast({ title: "Stock added", description: `+${values.quantity} units recorded for ${productName} at ${locationName}.` });

      form.reset({ productId: 0, locationId: 0, quantity: 1, unitCost: undefined, notes: "" });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      const message = e?.data?.error ?? e?.message ?? "Failed to record stock movement.";
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
          <p className="text-muted-foreground text-sm">Record inventory received into stock at a specific location.</p>
        </div>
      </div>

      {lastEntry && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-sm text-green-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>Added <strong>+{lastEntry.quantity}</strong> units to <strong>{lastEntry.productName}</strong> at <strong>{lastEntry.locationName}</strong> — logged successfully.</span>
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
                  <span className="text-muted-foreground">Global stock:</span>{" "}
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
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ? String(field.value) : ""}
                    >
                      <SelectTrigger data-testid="select-location-in">
                        <SelectValue placeholder="Select a location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {locations?.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>
                            <span className="font-mono text-xs mr-2 text-muted-foreground">{l.code}</span>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>Where is this stock being received?</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            {isWeightedAverage && (
              <FormField
                control={form.control}
                name="unitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost (per unit)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="e.g. 25.00"
                        className="font-mono w-40"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                        data-testid="input-unit-cost-in"
                      />
                    </FormControl>
                    <FormDescription>
                      Purchase price per unit for this batch. Used to recalculate the product's weighted average cost.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
