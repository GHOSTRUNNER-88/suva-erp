import { z } from "zod";

// Free text, not a strict enum — the industry field is a searchable
// suggest-as-you-type combobox backed by INDUSTRY_OPTIONS (see
// organization-wizard.jsx / lib/organization/options.js), but the user can
// always type something not on that list ("Other" + a custom value) and it
// must still validate.
const industryField = z.string().trim().min(1, "industryRequired").max(120, "industryTooLong");

export const ACCOUNTING_FEATURES = [
  "trackInventory",
  "multipleLocations",
  "manufacturing",
  "multipleWarehouses",
  "posRetail",
  "multiCurrency",
  "posRestaurant",
];

// Shared by createOrganizationAction (account/organizations/actions.js) and
// completeDefaultOrganizationAction ([company]/setup/actions.js) — both
// create-shaped flows collecting the same full field set, unlike
// organizationUpdateSchema (Settings) which deliberately excludes
// accountingStartDate/features since those can't be edited after creation.
// Kept in a plain module (not a "use server" file) because a "use server"
// file may only export async functions, not a zod schema object.
export const organizationSchema = z.object({
  name: z.string().trim().min(2, "organizationNameRequired").max(180, "organizationNameTooLong"),
  industry: industryField,
  address: z.string().trim().min(1, "addressRequired").max(1000, "addressTooLong"),
  accountingStartDate: z.string().trim().min(1, "accountingStartDateRequired"),
  isVatRegistered: z.boolean(),
  email: z.string().trim().email("emailInvalid").optional().or(z.literal("")),
  phoneNumber: z.string().trim().max(30, "phoneTooLong").optional().or(z.literal("")),
  panNumber: z.string().trim().regex(/^\d{9}$/, "panInvalid").optional().or(z.literal("")),
  website: z.string().trim().url("websiteInvalid").optional().or(z.literal("")),
  features: z.array(z.enum(ACCOUNTING_FEATURES)).default([]),
  // Set via uploadOrganizationLogoAction before this form submits — this
  // field just carries the resulting Firebase Storage URL along.
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
});
