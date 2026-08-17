import { redirect } from "next/navigation";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getSalesOrderFormData } from "../actions";
import SalesOrderForm from "../order-form";

export const metadata = {
  title: "New Sales Order",
};

// Reads the same query-string convention every "create X from Y" convenience
// button in this module uses (see actions.js's file header and
// [quotation]/page.js's "Create Order" button) — partyId/warehouseId/
// billingName/billingAddress/panNumber/notes plus a JSON-encoded `lines`
// array. Nothing here is a real DB link; it only pre-fills the form.
function parseInitialValues(searchParams) {
  const { partyId, warehouseId, billingName, billingAddress, panNumber, notes, lines } = searchParams;
  if (!partyId && !lines) return undefined;
  let parsedLines = [];
  if (lines) {
    try {
      parsedLines = JSON.parse(lines);
    } catch {
      parsedLines = [];
    }
  }
  return { partyId, warehouseId, billingName, billingAddress, panNumber, notes, lines: parsedLines };
}

export default async function NewSalesOrderPage({ params, searchParams }) {
  const { company } = await params;
  const resolvedSearchParams = await searchParams;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("sales")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, formData] = await Promise.all([getServerT(), getSalesOrderFormData(company)]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("addSalesOrder")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("salesOrdersSubtitle")}</p>
      </div>
      <SalesOrderForm
        companySlug={company}
        formData={formData}
        order={null}
        lines={[]}
        initialValues={parseInitialValues(resolvedSearchParams)}
      />
    </div>
  );
}
