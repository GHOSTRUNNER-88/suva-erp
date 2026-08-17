"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { FileOutput, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { notify } from "@/lib/toast";
import { decimalToInputValue } from "@/lib/utils";
import { StatusBadge } from "../purchase-orders-view";
import { deletePurchaseOrdersAction, updatePurchaseOrderStatusAction } from "../actions";
import OrderForm from "../order-form";

const STATUS_OPTIONS = ["draft", "ordered", "received", "cancelled"];

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Builds the "Create Bill from this Order" query string — a pure UI
// convenience (no DB relationship between purchase_orders and
// purchase_bills, see actions.js's file header comment). The New Purchase
// Bill form reads this back to pre-fill party/warehouse/lines.
function buildCreateBillHref(companySlug, order, lines) {
  const payload = {
    partyId: order.partyId,
    warehouseId: order.warehouseId,
    lines: lines.map((line) => ({
      itemId: line.itemId,
      variantId: line.variantId,
      unitId: line.unitId,
      quantity: line.quantity,
      rate: line.rate,
      discType: line.discType,
      discValue: line.discType === "percent" ? line.discPercent : line.discAmount,
    })),
  };
  return `/${companySlug}/purchase/bills/new?fromOrder=${encodeURIComponent(JSON.stringify(payload))}`;
}

export default function OrderDetailView({ companySlug, order, lines, formData }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [statusPending, startStatusTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  function changeStatus(status) {
    if (status === order.status) return;
    startStatusTransition(async () => {
      const result = await updatePurchaseOrderStatusAction(companySlug, order.id, status);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t(result.message));
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(t("confirmDeletePurchaseOrders", { count: 1 }))) return;
    startDeleteTransition(async () => {
      const result = await deletePurchaseOrdersAction(companySlug, [order.id]);
      if (!result.ok) {
        notify.error(result.formError ? t(result.formError) : t("somethingWentWrong"));
        return;
      }
      notify.success(t("purchaseOrdersDeleted", { count: result.count }));
      router.push(`/${companySlug}/purchase/orders`);
    });
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{t("editPurchaseOrder")}</h1>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            {t("cancel")}
          </Button>
        </div>
        <OrderForm companySlug={companySlug} mode="edit" order={order} initialLines={lines} formData={formData} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
            <StatusBadge status={order.status} t={t} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.partyName} · {order.orderDate}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={buildCreateBillHref(companySlug, order, lines)}>
            <Button type="button" variant="outline">
              <FileOutput className="h-4 w-4" />
              {t("createBillFromOrder")}
            </Button>
          </Link>
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            {t("edit")}
          </Button>
          <Button type="button" variant="outline" disabled={deleting} onClick={handleDelete}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {t("delete")}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-background p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t("status")}</span>
          <CreatableSelect
            className="w-48"
            options={STATUS_OPTIONS.map((status) => ({ value: status, label: t(status) }))}
            value={order.status}
            onChange={changeStatus}
            disabled={statusPending}
          />
          {statusPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("supplier")} value={order.partyName} />
          <Field label={t("warehouse")} value={order.warehouseName || "—"} />
          <Field label={t("expectedDate")} value={order.expectedDate || "—"} />
          <Field label={t("panNumber")} value={order.panNumber || "—"} />
          <Field label={t("supplierName")} value={order.supplierName || "—"} />
          <Field label={t("supplierAddress")} value={order.supplierAddress || "—"} />
        </div>
        {order.notes && (
          <div className="mt-3 border-t pt-3 text-sm">
            <p className="text-muted-foreground">{t("notes")}</p>
            <p className="mt-1 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2 text-left">{t("item")}</th>
              <th className="px-4 py-2 text-left">{t("unit")}</th>
              <th className="px-4 py-2 text-right">{t("quantity")}</th>
              <th className="px-4 py-2 text-right">{t("rate")}</th>
              <th className="px-4 py-2 text-right">{t("discount")}</th>
              <th className="px-4 py-2 text-right">{t("lineTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  {line.itemName}
                  {line.variantName && <span className="ml-1 text-xs text-muted-foreground">({line.variantName})</span>}
                </td>
                <td className="px-4 py-2">{line.unitCode}</td>
                <td className="px-4 py-2 text-right tabular-nums">{decimalToInputValue(line.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(line.rate)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(line.discAmount)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-sm space-y-2 rounded-2xl border bg-background p-4">
        <TotalRow label={t("subtotal")} value={order.subtotal} />
        <TotalRow label={t("discount")} value={order.discAmount} negative />
        {order.isVatApplicable === 1 && <TotalRow label={`${t("vat")} (${decimalToInputValue(order.vatPercent)}%)`} value={order.vatAmount} />}
        <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
          <span>{t("totalAmount")}</span>
          <span className="tabular-nums">{formatAmount(order.totalAmount)}</span>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function TotalRow({ label, value, negative }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {negative && Number(value) > 0 ? "-" : ""}
        {formatAmount(value)}
      </span>
    </div>
  );
}
