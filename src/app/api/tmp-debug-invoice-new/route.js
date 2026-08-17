import { createSession } from "@/lib/auth/session";

export async function GET() {
  await createSession({
    userId: 1,
    companyId: 4,
    companySlug: "kick-lifestyle1",
    companyDbName: "suva_co_kick_lifestyle1_dbe1d8f2",
    organizationId: 1,
    organizationDbName: "suva_org_kick_lifestyle1_8343740f",
    role: "owner",
    needsOrganizationSetup: false,
  });
  return new Response("ok");
}
