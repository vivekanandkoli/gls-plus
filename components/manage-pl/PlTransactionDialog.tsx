"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlRow, PlRowInput, PlTxType } from "@/lib/pl-import";

export type PlDialogMode = "add" | "edit";

type PlTransactionDialogProps = {
  open: boolean;
  mode: PlDialogMode;
  row: PlRow | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: PlRowInput, existing: PlRow | null) => void;
  onDelete?: (row: PlRow) => void;
};

const emptyForm = (): PlRowInput => ({
  type: "SELL",
  dateIso: new Date().toISOString().slice(0, 10),
  invoice: "",
  customer: "",
  weightGrams: 0,
  ratePerGram: 0,
  valueThb: 0,
  note: "",
});

export function PlTransactionDialog({
  open,
  mode,
  row,
  onOpenChange,
  onSave,
  onDelete,
}: PlTransactionDialogProps) {
  const [form, setForm] = useState<PlRowInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && row) {
      setForm({
        type: row.type,
        dateIso: row.dateIso ?? "",
        invoice: row.invoice,
        customer: row.customer,
        weightGrams: row.weightGrams,
        ratePerGram: row.ratePerGram,
        valueThb: row.valueThb,
        note: row.note,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, mode, row]);

  const setField = <K extends keyof PlRowInput>(key: K, value: PlRowInput[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "weightGrams" || key === "ratePerGram") {
        if (next.weightGrams > 0 && next.ratePerGram > 0) {
          next.valueThb = next.weightGrams * next.ratePerGram;
        }
      }
      if (key === "valueThb" && next.weightGrams > 0) {
        next.ratePerGram = next.valueThb / next.weightGrams;
      }
      return next;
    });
  };

  const handleSubmit = () => {
    if (!form.dateIso) {
      setError("Date is required.");
      return;
    }
    if (form.weightGrams <= 0) {
      setError("Weight must be greater than zero.");
      return;
    }
    if (form.valueThb <= 0) {
      setError("Value must be greater than zero.");
      return;
    }
    onSave(form, mode === "edit" ? row : null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add transaction" : "Edit transaction"}
          </DialogTitle>
          <DialogDescription>
            WAC, running stock, and profit recalculate automatically after you
            save.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Type
              </label>
              <Select
                value={form.type}
                onValueChange={(v) => setField("type", v as PlTxType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">BUY</SelectItem>
                  <SelectItem value="SELL">SELL</SelectItem>
                  <SelectItem value="CASH">CASH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Date
              </label>
              <Input
                type="date"
                value={form.dateIso ?? ""}
                onChange={(e) => setField("dateIso", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Invoice
              </label>
              <Input
                value={form.invoice}
                onChange={(e) => setField("invoice", e.target.value)}
                placeholder="UP20250001"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Customer
              </label>
              <Input
                value={form.customer}
                onChange={(e) => setField("customer", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Weight (g)
              </label>
              <Input
                type="number"
                step="0.001"
                value={form.weightGrams || ""}
                onChange={(e) =>
                  setField("weightGrams", Number(e.target.value) || 0)
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Rate (฿/g)
              </label>
              <Input
                type="number"
                step="0.0001"
                value={form.ratePerGram || ""}
                onChange={(e) =>
                  setField("ratePerGram", Number(e.target.value) || 0)
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Value (฿)
              </label>
              <Input
                type="number"
                step="0.01"
                value={form.valueThb || ""}
                onChange={(e) =>
                  setField("valueThb", Number(e.target.value) || 0)
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Note
            </label>
            <Input
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              placeholder="Optional"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {mode === "edit" && row && onDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onDelete(row);
                onOpenChange(false);
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
