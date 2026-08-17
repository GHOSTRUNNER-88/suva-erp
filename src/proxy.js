import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/auth/session";

/**
 * Next.js 16 renamed middleware.ts -> proxy.ts (this always runs on the
 * Node.js runtime now, not edge — fine, since iron-session/crypto need
 * Node anyway). Guards every /[company]/* route: no session, or a
 * session for a DIFFERENT company than the URL, sends you to /signup
 * (there's no /login page yet — see AGENTS.md/create-company.js).
 *
 * /account/* is the company-admin area (Organizations, Module Store,
 * Company Settings) — gated on session.role (the company-wide role set at
 * login, see login/actions.js), not the per-organization role. A member
 * hitting it directly (typed URL, stale bookmark) gets bounced to the ERP
 * dashboard instead of a dead end or a 403 page.
 *
 * /setup is the mandatory one-time "complete your main organization" wizard
 * (see app/[company]/setup, completeDefaultOrganizationAction) — while
 * session.needsOrganizationSetup is true, an owner/admin is redirected
 * there from anywhere else instead of being allowed to wander into an ERP
 * whose main organization was never actually configured (no fiscal year,
 * no industry, etc. — those fields can't be edited later, see
 * organizations/actions.js's organizationUpdateSchema). Members can't
 * complete this wizard (owner/admin only, same as creating an
 * organization), so they're deliberately NOT gated here — blocking a
 * member on a page only the owner can finish would just be a dead end.
 */
export async function proxy(request) {
  const [, companySlug, secondSegment] = request.nextUrl.pathname.split("/");

  if (secondSegment === "login") {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession(request, response, sessionOptions);

  if (!session.userId || session.companySlug !== companySlug) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isOwnerOrAdmin = ["owner", "admin"].includes(session.role);

  if (session.needsOrganizationSetup && isOwnerOrAdmin && secondSegment !== "setup") {
    return NextResponse.redirect(new URL(`/${companySlug}/setup`, request.url));
  }

  if (secondSegment === "account" && !isOwnerOrAdmin) {
    return NextResponse.redirect(new URL(`/${companySlug}/dashboard`, request.url));
  }

  return response;
}

export const config = {
  // Everything except: api routes, Next internals, the public signup
  // page, and anything that looks like a static file (has a dot in the
  // last path segment) — that's every /[company]/* route.
  matcher: ["/((?!api|_next|signup|login|logout|.*\\..*|$).*)"],
};
