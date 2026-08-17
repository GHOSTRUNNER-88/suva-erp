import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getServerT } from "@/lib/i18n-server";
import { getAttributeDetail, listAttributeValues } from "../actions";
import AttributeDetailView from "./attribute-detail-view";

export const metadata = {
  title: "Attribute",
};

export default async function AttributeDetailPage({ params }) {
  const { company, attribute } = await params;
  const context = await getAuthenticatedAppContext(company);

  if (!context.accessibleModules.includes("items")) {
    redirect(`/${company}/dashboard`);
  }

  const [t, attributeDetail, values] = await Promise.all([
    getServerT(),
    getAttributeDetail(company, attribute),
    listAttributeValues(company, attribute),
  ]);

  if (!attributeDetail) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/${company}/items/attributes`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("attributes")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{attributeDetail.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("attributesSubtitle")}</p>
      </div>
      <AttributeDetailView companySlug={company} attribute={attributeDetail} initialValues={values} />
    </div>
  );
}
