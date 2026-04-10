import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  usePreviewProductImport,
  useCommitProductImport,
  getListProductsQueryKey,
  getGetInventorySummaryQueryKey,
  getListCategoriesQueryKey,
  ImportProductRow,
  ProductImportPreviewItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, CheckCircle, AlertCircle, Loader2, FileDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Step = "upload" | "preview" | "done";

const EXPECTED_COLUMNS = ["Category Name", "Product Name", "Unit of Measure", "Unit Cost"];

const TEMPLATE_ROWS = [
  ["Lipstick", "Velvet Rose Lipstick", "pcs", "12.50"],
  ["Skincare", "Hydrating Serum 30ml", "ml", "28.00"],
];

function downloadTemplate() {
  const header = EXPECTED_COLUMNS.join(",");
  const rows = TEMPLATE_ROWS.map((r) => r.join(",")).join("\n");
  const csv = `${header}\n${rows}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "product-master-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function parseFile(file: File): Promise<ImportProductRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return raw.map((row) => ({
    categoryName: String(row["Category Name"] ?? row["category_name"] ?? row["CategoryName"] ?? "").trim(),
    productName: String(row["Product Name"] ?? row["product_name"] ?? row["ProductName"] ?? "").trim(),
    unitOfMeasure: String(row["Unit of Measure"] ?? row["unit_of_measure"] ?? row["UnitOfMeasure"] ?? "pcs").trim(),
    unitCost: Number(row["Unit Cost"] ?? row["unit_cost"] ?? row["UnitCost"] ?? 0),
  }));
}

export default function ImportProductsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportProductRow[]>([]);
  const [preview, setPreview] = useState<ProductImportPreviewItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const previewMutation = usePreviewProductImport();
  const commitMutation = useCommitProductImport();

  const hasErrors = preview.some((p) => p.status === "error");
  const errorCount = preview.filter((p) => p.status === "error").length;
  const newCount = preview.filter((p) => p.status === "new").length;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) {
        setParseError("The file is empty or has no data rows.");
        return;
      }
      setRows(parsed);

      const result = await previewMutation.mutateAsync(parsed);
      setPreview(result);
      setStep("preview");
    } catch {
      setParseError("Failed to parse file. Ensure it is a valid CSV or XLSX with the correct columns.");
    }

    // Reset input so same file can be re-uploaded
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleCommit = async () => {
    try {
      const result = await commitMutation.mutateAsync(rows);
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInventorySummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      toast({
        title: "Import complete",
        description: `${result.created} product(s) created.${result.errors.length > 0 ? ` ${result.errors.length} row(s) skipped.` : ""}`,
      });
      setStep("done");
    } catch {
      toast({ variant: "destructive", title: "Import failed", description: "Could not commit the import." });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Import Product Master</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV or XLSX file to bulk-create products. SKUs are auto-generated.
          </p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={step === "upload" ? "text-foreground font-medium" : ""}>1. Upload</span>
        <span>→</span>
        <span className={step === "preview" ? "text-foreground font-medium" : ""}>2. Preview</span>
        <span>→</span>
        <span className={step === "done" ? "text-foreground font-medium" : ""}>3. Confirm</span>
      </div>

      {step === "upload" && (
        <div className="bg-card border border-border rounded-lg p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="font-medium">Required Columns</h3>
            <div className="flex flex-wrap gap-2">
              {EXPECTED_COLUMNS.map((col) => (
                <Badge key={col} variant="outline" className="font-mono text-xs">
                  {col}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Category Name must match an existing category. SKU is auto-generated from the category prefix.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileDown className="w-4 h-4 mr-2" />
              Download Template
            </Button>
          </div>

          <div
            className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Click to upload CSV or XLSX</p>
            <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />

          {(previewMutation.isPending) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Parsing and validating…
            </div>
          )}

          {parseError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              {parseError}
            </div>
          )}
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
              <span>{newCount} new product(s)</span>
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>{errorCount} error(s) — fix the file and re-upload</span>
              </div>
            )}
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>UoM</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead>Generated SKU</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((item) => (
                  <TableRow
                    key={item.rowNumber}
                    className={
                      item.status === "error"
                        ? "bg-destructive/10 hover:bg-destructive/15"
                        : "bg-green-500/5 hover:bg-green-500/10"
                    }
                  >
                    <TableCell className="text-muted-foreground text-xs">{item.rowNumber}</TableCell>
                    <TableCell>{item.categoryName}</TableCell>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>{item.unitOfMeasure}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.unitCost)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.generatedSku ?? "—"}
                    </TableCell>
                    <TableCell>
                      {item.status === "error" ? (
                        <span className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {item.error}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">
                          New
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setStep("upload"); setPreview([]); setRows([]); }}>
              Re-upload File
            </Button>
            <Button
              onClick={handleCommit}
              disabled={hasErrors || commitMutation.isPending}
            >
              {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {hasErrors ? "Fix Errors to Confirm" : `Confirm Import (${newCount} products)`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="bg-card border border-border rounded-lg p-12 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <h3 className="text-lg font-semibold">Import Successful</h3>
          <p className="text-sm text-muted-foreground">
            Your products have been created and are now available in the inventory.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => setLocation("/")}>View Inventory</Button>
            <Button variant="outline" onClick={() => { setStep("upload"); setPreview([]); setRows([]); }}>
              Import Another File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
