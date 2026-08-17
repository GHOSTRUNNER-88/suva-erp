import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { AccountSettingsView } from "./account-settings-view";

export const metadata = {
  title: "Account Settings",
};

export default async function AccountSettingsPage({ params }) {
  const { company } = await params;
  const context = await getAuthenticatedAppContext(company);

  return <AccountSettingsView companySlug={company} company={company} user={context.user} />;
}
