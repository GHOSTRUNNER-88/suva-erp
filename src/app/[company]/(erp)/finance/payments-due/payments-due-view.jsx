"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysOverdue(documentDate) {
  const days = Math.floor((Date.now() - new Date(`${documentDate}T00:00:00`).getTime()) / 86400000);
  return days > 0 ? days : 0;
}

/**
 * No dedicated due-list existed in legacy — built fresh per this build's
 * brief. Two tabs: receivable (sales invoices due FROM customers) and
 * payable (purchase bills due TO suppliers), both oldest-due-first.
 */
export default function PaymentsDueView({ receivable, payable }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("receivable");
  const rows = tab === "receivable" ? receivable : payable;
  const totalDue = rows.reduce((sum, row) => sum + row.dueAmount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={[
            { value: "receivable", label: t("receivable") },
            { value: "payable", label: t("payable") },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="flex items-center gap-2 rounded-2xl border bg-background px-4 py-2 text-sm">
          <span className="text-muted-foreground">{t("totalDue")}</span>
          <span className="font-semibold tabular-nums">{formatAmount(totalDue)}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2 text-left">{t("document")}</th>
              <th className="px-4 py-2 text-left">{tab === "receivable" ? t("customer") : t("supplier")}</th>
              <th className="px-4 py-2 text-right">{t("totalAmount")}</th>
              <th className="px-4 py-2 text-right">{t("paidAmount")}</th>
              <th className="px-4 py-2 text-right">{t("dueAmount")}</th>
              <th className="px-4 py-2 text-right">{t("daysOverdue")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    {tab === "receivable" ? <ArrowDownCircle className="h-8 w-8" /> : <ArrowUpCircle className="h-8 w-8" />}
                    {t("noPaymentsDue")}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const overdue = daysOverdue(row.documentDate);
                return (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{row.documentNo}</p>
                      <p className="text-xs text-muted-foreground">{row.documentDate}</p>
                    </td>
                    <td className="px-4 py-2.5">{row.partyName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatAmount(row.totalAmount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatAmount(row.paidAmount)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatAmount(row.dueAmount)}</td>
                    <td className={cn("px-4 py-2.5 text-right tabular-nums", overdue > 0 && "text-destructive")}>
                      {overdue > 0 ? overdue : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
