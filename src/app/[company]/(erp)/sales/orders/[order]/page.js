import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getSalesOrderDetail, getSalesOrderFormData } from "../actions";
import SalesOrderForm from "../order-form";

export const metadata = {
  title: "Sales Order",
};

// "Create Invoice from this Order" — pure UI convenience, no DB link (see
// actions.js's file header). Builds the same query-string shape the New
// Sales Invoice form (once built) is expected to read: partyId/warehouseId/
// billingName/billingAddress/panNumber/notes/fromOrderId plus a JSON-encoded
// `lines` array of {itemId, variantId, unitId, quantity, rate, discType,
// discValue}.
function buildInvoiceHref(company, order, lines) {
  const params = new URLSearchParams({
    partyId: String(order.partyId),
    warehouseId: order.warehouseId ? String(order.warehouseId) : "",
    billingName: order.billingName ?? "",
    billingAddress: order.billingAddress ?? "",
    panNumber: order.panNumber ?? "",
    notes: order.notes ?? "",
    fromOrderId: String(order.id),
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
  return `/${company}/sales/invoices/new?${params.toString()}`;
}

export default async function SalesOrderDetailPage({ params }) {
  const { company, order: orderId } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, detail, formData] = await Promise.all([
    getServerT(),
    getSalesOrderDetail(company, orderId),
    getSalesOrderFormData(company),
  ]);

  if (!detail) {
    notFound();
  }

  const canConvert = detail.order.status === "draft" || detail.order.status === "confirmed";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href={`/${company}/sales/orders`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("salesOrders")}
        </Link>
        {canConvert && (
          <Link href={buildInvoiceHref(company, detail.order, detail.lines)}>
            <Button type="button" variant="outline">
              <FileText className="h-4 w-4" />
              {t("createInvoiceFromOrder")}
            </Button>
          </Link>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{detail.order.orderNumber}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{detail.order.partyName}</p>
      </div>

      <SalesOrderForm companySlug={company} formData={formData} order={detail.order} lines={detail.lines} />
    </div>
  );
}
