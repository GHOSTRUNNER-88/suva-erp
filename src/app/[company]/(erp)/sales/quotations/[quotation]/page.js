import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getSalesQuotationDetail, getSalesQuotationFormData } from "../actions";
import SalesQuotationForm from "../quotation-form";

export const metadata = {
  title: "Sales Quotation",
};

// "Create Order" / "Create Invoice" from this quotation — pure UI
// convenience, no DB link (see actions.js's file header). Both read the same
// query-string shape: partyId/warehouseId/billingName/billingAddress/
// panNumber/notes/from<Source>Id plus a JSON-encoded `lines` array.
function buildConvertHref(target, company, quotation, lines) {
  const params = new URLSearchParams({
    partyId: String(quotation.partyId),
    warehouseId: quotation.warehouseId ? String(quotation.warehouseId) : "",
    billingName: quotation.billingName ?? "",
    billingAddress: quotation.billingAddress ?? "",
    panNumber: quotation.panNumber ?? "",
    notes: quotation.notes ?? "",
    fromQuotationId: String(quotation.id),
    lines: JSON.stringify(
      lines.map((line) => ({
        itemId: line.itemId,
        variantId: line.variantId,
        unitId: line.unitId,
        quantity: line.quantity,
        rate: line.rate,
        discType: line.discType,
        discValue: line.discType === "percent" ? line.discPercent : line.discAmount,
      }))
    ),
  });
  const path = target === "order" ? "sales/orders/new" : "sales/invoices/new";
  return `/${company}/${path}?${params.toString()}`;
}

export default async function SalesQuotationDetailPage({ params }) {
  const { company, quotation: quotationId } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, detail, formData] = await Promise.all([
    getServerT(),
    getSalesQuotationDetail(company, quotationId),
    getSalesQuotationFormData(company),
  ]);

  if (!detail) {
    notFound();
  }

  const canConvert = detail.quotation.status === "draft" || detail.quotation.status === "sent" || detail.quotation.status === "accepted";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/${company}/sales/quotations`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("quotations")}
        </Link>
        {canConvert && (
          <div className="flex gap-2">
            <Link href={buildConvertHref("order", company, detail.quotation, detail.lines)}>
              <Button type="button" variant="outline">
                <ClipboardList className="h-4 w-4" />
                {t("createOrderFromQuotation")}
              </Button>
            </Link>
            <Link href={buildConvertHref("invoice", company, detail.quotation, detail.lines)}>
              <Button type="button" variant="outline">
                <FileText className="h-4 w-4" />
                {t("createInvoiceFromQuotation")}
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{detail.quotation.quotationNumber}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{detail.quotation.partyName}</p>
      </div>

      <SalesQuotationForm companySlug={company} formData={formData} quotation={detail.quotation} lines={detail.lines} />
    </div>
  );
}
