"use server";

import { and, asc, eq, gt, ne } from "drizzle-orm";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { parties, purchaseBills, salesInvoices } from "@/db/schema/organization";

function canAccessFinance(context) {
  return context.accessibleModules.includes("finance");
}

// No dedicated due-list existed in legacy admin/*.php (grepped, nothing
// found) — built fresh per the task brief: every non-cancelled sales
// invoice / purchase bill with dueAmount > 0, oldest-due-first.
export async function listPaymentsDue(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessFinance(context)) return { receivable: [], payable: [] };
  const db = getOrganizationDb(context.session.organizationDbName);

  const [receivableRows, payableRows] = await Promise.all([
    db
      .select({
        id: salesInvoices.id,
        documentNo: salesInvoices.invoiceNumber,
        documentDate: salesInvoices.invoiceDate,
        partyId: salesInvoices.partyId,
        partyName: parties.name,
        totalAmount: salesInvoices.totalAmount,
        paidAmount: salesInvoices.receivedAmount,
        dueAmount: salesInvoices.dueAmount,
      })
      .from(salesInvoices)
      .innerJoin(parties, eq(salesInvoices.partyId, parties.id))
      .where(and(ne(salesInvoices.status, "cancelled"), gt(salesInvoices.dueAmount, "0")))
      .orderBy(asc(salesInvoices.invoiceDate)),
    db
      .select({
        id: purchaseBills.id,
        documentNo: purchaseBills.billNumber,
        documentDate: purchaseBills.billDate,
        partyId: purchaseBills.partyId,
        partyName: parties.name,
        totalAmount: purchaseBills.totalAmount,
        paidAmount: purchaseBills.paidAmount,
        dueAmount: purchaseBills.dueAmount,
      })
      .from(purchaseBills)
      .innerJoin(parties, eq(purchaseBills.partyId, parties.id))
      .where(and(ne(purchaseBills.status, "cancelled"), gt(purchaseBills.dueAmount, "0")))
      .orderBy(asc(purchaseBills.billDate)),
  ]);

  return {
    receivable: receivableRows.map((row) => ({
      ...row,
      totalAmount: Number(row.totalAmount),
      paidAmount: Number(row.paidAmount),
      dueAmount: Number(row.dueAmount),
    })),
    payable: payableRows.map((row) => ({
      ...row,
      totalAmount: Number(row.totalAmount),
      paidAmount: Number(row.paidAmount),
      dueAmount: Number(row.dueAmount),
    })),
  };
}
