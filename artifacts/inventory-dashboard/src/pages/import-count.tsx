import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  usePreviewCountImport,
  useCommitCountImport,
  getListProductsQueryKey,
  getGetInventorySummaryQueryKey,
  ImportCountRow,
  CountImportPreviewItem,
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
import { ArrowLeft, Upload, CheckCircle, AlertCircle, Loader2, FileDown, TrendingUp, TrendingDown, Minus } from "lucide-react";

type Step = "upload" | "preview" | "done";

const EXPECTED_COLUMNS = ["SKU", "Physical Count"];

function downloadTemplate() {
  const header = EXPECTED_COLUMNS.join(",");
  const rows = [
    ["LIP0000000001", "120"],
    ["SKIN0000000001", "45"],
  ]
    .map((r) => r.join(","))
    .join("\n");
  const csv = `${header}\n${rows}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "year-end-count-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function parseFile(file: File): Promise<ImportCountRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  return raw.map((row) => ({
    sku: String(row["SKU"] ?? row["sku"] ?? row["Sku"] ?? "").trim(),
    physicalCount: Number(row["Physical Count"] ?? row["physical_count"] ?? row["PhysicalCount"] ?? 0),
  }));
}

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0)
    return (
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        <Minus className="w-3 h-3" /> No change
      </span>
    );
  if (diff > 0)
    return (
      <span className="flex items-center gap-1 text-blue-400 text-xs font-mono">
        <TrendingUp className="w-3 h-3" /> +{diff}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-orange-400 text-xs font-mono">
      <TrendingDown className="w-3 h-3" /> {diff}
    </span>
  );
}

export default function ImportCountPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ImportCountRow[]>([]);
  const [preview, setPreview] = useState<CountImportPreviewItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const previewMutation = usePreviewCountImport();
  const commitMutation = useCommitCountImport();

  const hasErrors = preview.some((p) => p.status === "error");
  const errorCount = preview.filter((p) => p.status === "error").length;
  const changeCount = preview.filter((p) => p.status === "change").length;
  const noChangeCount = preview.filter((p) => p.status === "no_change").length;

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

    if (fileRef.current) fileRef.current.value = "";
  };

  const handleCommit = async () => {
    // Only commit rows that have changes (skip no_change rows, they're no-ops)
    const rowsToCommit = rows.filter((r) => {
      const previewItem = preview.find((p) => p.sku.toLowerCase() === r.sku.toLowerCase());
      return previewItem?.status === "change";
    });

    try {
      const result = await commitMutation.mutateAsync(rowsToCommit);
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInventorySummaryQueryKey() });
      toast({
        title: "Year-end count committed",
        description: `${result.adjusted} product(s) adjusted.${result.errors.length > 0 ? ` ${result.errors.length} row(s) skipped.` : ""}`,
      });
      setStep("done");
    } catch {
      toast({ variant: "destructive", title: "Commit failed", description: "Could not apply the stock adjustments." });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Year-End Stock Count</h2>
          <p className="text-sm text-muted-foreground">
            Upload physical counts. The system calculates the delta and records adjustment log entries.
          </p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={step === "upload" ? "text-foreground font-medium" : ""}>1. Upload</span>
        <span>→</span>
        <span className={step === "preview" ? "text-foreground font-medium" : ""}>2. Preview Delta</span>
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
              SKU must exactly match products in the system. The adjustment is calculated as:{" "}
              <span className="font-mono">Difference = Physical Count − System Balance</span>
            </p>
          </div>

          <div className="bg-muted/40 border border-border rounded-md p-4 text-sm space-y-1">
            <p className="font-medium text-foreground">How the math works</p>
            <p className="text-muted-foreground">
              System says <span className="font-mono text-foreground">100</span> units. Physical count is{" "}
              <span className="font-mono text-foreground">125</span>. The system records a{" "}
              <span className="font-mono text-blue-400">+25 Adjustment</span> log entry — never just overwriting the
              number.
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileDown className="w-4 h-4 mr-2" />
            Download Template
          </Button>

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

          {previewMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Calculating deltas…
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
          <div className="flex items-center gap-6 bg-card border border-border rounded-lg p-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
              <span>{changeCount} to adjust</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Minus className="w-3 h-3" />
              <span>{noChangeCount} no change</span>
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>{errorCount} error(s) — fix and re-upload</span>
              </div>
            )}
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead className="text-right">System Balance</TableHead>
                  <TableHead className="text-right">Physical Count</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
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
                        : item.status === "change"
                          ? "bg-blue-500/5 hover:bg-blue-500/10"
                          : ""
                    }
                  >
                    <TableCell className="text-muted-foreground text-xs">{item.rowNumber}</TableCell>
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell className="font-medium">{item.productName || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{item.status !== "error" ? item.systemBalance : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{item.physicalCount}</TableCell>
                    <TableCell className="text-right">
                      {item.status !== "error" ? <DiffBadge diff={item.difference} /> : "—"}
                    </TableCell>
                    <TableCell>
                      {item.status === "error" ? (
                        <span className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {item.error}
                        </span>
                      ) : item.status === "change" ? (
                        <Badge variant="outline" className="text-blue-400 border-blue-400/30 text-xs">
                          Adjustment
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No change</span>
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
              disabled={hasErrors || changeCount === 0 || commitMutation.isPending}
            >
              {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {hasErrors
                ? "Fix Errors to Confirm"
                : changeCount === 0
                  ? "No Adjustments Needed"
                  : `Commit ${changeCount} Adjustment(s)`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="bg-card border border-border rounded-lg p-12 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <h3 className="text-lg font-semibold">Count Committed</h3>
          <p className="text-sm text-muted-foreground">
            All adjustments have been recorded in the inventory ledger with audit log entries.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => setLocation("/")}>View Inventory</Button>
            <Button variant="outline" onClick={() => { setStep("upload"); setPreview([]); setRows([]); }}>
              Upload Another File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
