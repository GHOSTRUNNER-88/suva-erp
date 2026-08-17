import { eq } from "drizzle-orm";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { companies } from "@/db/schema/master";
import { getMasterDb } from "@/lib/db";
import LoginForm from "@/app/login/login-form";

export const metadata = {
  title: "Company Login",
};

export default async function CompanyLoginPage({ params }) {
  const { company } = await params;
  const [companyRow] = await getMasterDb()
    .select({ name: companies.name, slug: companies.slug })
    .from(companies)
    .where(eq(companies.slug, company))
    .limit(1);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-primary/25 bg-card p-8 shadow-sm">
          <div className="mb-6 flex justify-center">
            <Logo size={32} />
          </div>
          <div className="mb-7 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{companyRow?.name ?? "Company"} login</h1>
            <p className="text-sm text-muted-foreground">Use the account assigned to /{company}.</p>
          </div>
          <LoginForm companySlug={company} />
        </div>
      </div>
      <Footer />
    </div>
  );
}
