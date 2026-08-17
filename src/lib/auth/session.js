import { cookies } from "next/headers";
import { getIronSession } from "iron-session";

/**
 * Session shape, set once at login/signup and read on every request (see
 * proxy.js). Mirrors the legacy app's $_SESSION keys (user id, active
 * company/organization) but flattened into one signed+encrypted cookie
 * instead of server-side session state, since there's no shared PHP-style
 * session store here.
 *
 * @typedef {Object} SuvaSessionData
 * @property {number} userId
 * @property {"owner"|"admin"|"member"} role
 * @property {number} companyId
 * @property {string} companySlug
 * @property {string} companyDbName
 * @property {number} organizationId
 * @property {string} organizationDbName
 * @property {boolean} [needsOrganizationSetup] - true until the Company's
 *   default (main) Organization has completed the one-time setup wizard
 *   (see app/[company]/setup) — set at signup/login, cleared once
 *   completeDefaultOrganizationAction succeeds. proxy.js redirects to
 *   /[company]/setup for as long as this is true.
 */

const sessionOptions = {
  cookieName: "suva_session",
  password: process.env.SESSION_SECRET,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

if (!sessionOptions.password) {
  throw new Error("SESSION_SECRET is not set in the environment");
}

/** Reads the current request's session (Server Components/Actions/Route Handlers only). */
export async function getSession() {
  return getIronSession(await cookies(), sessionOptions);
}

/** Populates and persists the session after a successful signup or login. */
export async function createSession(data) {
  const session = await getSession();
  Object.assign(session, data);
  await session.save();
  return session;
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}

export { sessionOptions };
