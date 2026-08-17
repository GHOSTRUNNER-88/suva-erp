"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { users } from "@/db/schema/company";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getCompanyDb } from "@/lib/db";
import { z } from "zod";

// Email and role are deliberately not here — email is Firebase-managed
// identity (changing it needs re-verification, not a plain text edit) and
// role is system-controlled, not self-service.
const profileSchema = z.object({
  firstName: z.string().trim().min(1, "firstNameRequired").max(100, "firstNameTooLong"),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  phoneNumber: z.string().trim().max(30, "phoneTooLong").optional().or(z.literal("")),
});

export async function updateAccountProfileAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const companyDb = getCompanyDb(context.session.companyDbName);

  await companyDb
    .update(users)
    .set({
      firstName: data.firstName,
      lastName: data.lastName || null,
      phoneNumber: data.phoneNumber || null,
    })
    .where(eq(users.id, context.session.userId));

  revalidatePath(`/${companySlug}/account/settings`);
  return { ok: true, message: "profileUpdated" };
}
