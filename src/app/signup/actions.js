"use server";

import { redirect } from "next/navigation";
import { signupSchema } from "@/lib/company/signup-schema";
import {
  createCompanyWithOwner,
  firebaseUidIsAvailable,
  panIsAvailable,
  slugIsAvailable,
} from "@/lib/company/create-company";
import { createSession } from "@/lib/auth/session";
import { getAdminAuth } from "@/lib/firebase/admin";

/**
 * Live availability check as the user types the URL/slug field — purely
 * informational. The real, race-safe guarantee is still the UNIQUE
 * constraint on `companies.slug` enforced at signup time in
 * createCompanyWithOwner(); a slug could still be taken between this
 * check and actual submission, which signupAction() handles separately.
 */
export async function checkSlugAvailability(slug) {
  if (typeof slug !== "string" || !/^[a-z0-9-]{2,60}$/.test(slug)) {
    return false;
  }
  return slugIsAvailable(slug);
}

export async function checkPanAvailability(panNumber) {
  if (typeof panNumber !== "string" || !/^\d{9}$/.test(panNumber)) {
    return false;
  }
  return panIsAvailable(panNumber);
}

/**
 * Called right after a Firebase credential is obtained (Google popup, or
 * once a password account is created) — lets the signup form find out
 * *before* final submission whether this identity already owns a Company,
 * so it can offer to log the user in instead of pretending signup is still
 * possible.
 */
export async function checkAccountAvailability(firebaseUid) {
  if (typeof firebaseUid !== "string" || !firebaseUid) {
    return false;
  }
  return firebaseUidIsAvailable(firebaseUid);
}

/**
 * @param {{idToken: string} & unknown} input - company fields (validated
 *   against signupSchema) plus a Firebase ID token obtained client-side
 *   (email/password createUserWithEmailAndPassword, or Google sign-in).
 * @returns {Promise<{ok: false, fieldErrors: Record<string,string[]>, formError?: string}>}
 *   on failure. On success this redirects and never returns.
 */
export async function signupAction(input) {
  const { idToken, ...companyInput } = input ?? {};

  const parsed = signupSchema.safeParse(companyInput);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (!idToken) {
    return {
      ok: false,
      fieldErrors: {},
      formError: "signInIncomplete",
    };
  }

  let decodedToken;
  try {
    decodedToken = await getAdminAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error("[signup] invalid Firebase ID token", error);
    return {
      ok: false,
      fieldErrors: {},
      formError: "sessionExpired",
    };
  }

  let result;
  try {
    result = await createCompanyWithOwner({
      ...parsed.data,
      email: decodedToken.email,
      firebaseUid: decodedToken.uid,
    });
  } catch (error) {
    if (error.code === "SLUG_TAKEN") {
      return {
        ok: false,
        fieldErrors: { slug: ["slugTaken"] },
      };
    }
    if (error.code === "PAN_TAKEN") {
      return {
        ok: false,
        fieldErrors: { panNumber: ["panTaken"] },
      };
    }
    if (error.code === "ACCOUNT_ALREADY_REGISTERED") {
      return {
        ok: false,
        fieldErrors: {},
        formError: "errAccountExists",
      };
    }
    console.error("[signup] failed", error);
    return {
      ok: false,
      fieldErrors: {},
      formError: "signupFailed",
    };
  }

  await createSession({
    userId: result.userId,
    role: result.role,
    companyId: result.companyId,
    companySlug: result.companySlug,
    companyDbName: result.companyDbName,
    organizationId: result.organizationId,
    organizationDbName: result.organizationDbName,
    // The default Organization createCompanyWithOwner() just created is
    // always a bare stub (name + PAN only, no accountingStartDate) — the
    // setup wizard is mandatory before anything else, see proxy.js.
    needsOrganizationSetup: true,
  });

  redirect(`/${result.companySlug}/setup`);
}
