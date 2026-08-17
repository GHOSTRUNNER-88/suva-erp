/**
 * Triggers Firebase Auth's own built-in password-reset email — no separate
 * email provider needed, this is free on Firebase's Spark plan and Firebase
 * sends it via its own infrastructure/templates. Used as the "email
 * invite" flow for adding an organization user: the account is created
 * (Admin SDK, server-side) with a random password nobody knows, then this
 * sends the user a link to set their own real password.
 *
 * Deliberately a raw REST call to Identity Toolkit, not the `firebase/auth`
 * client SDK — that SDK is explicitly client-only in this project
 * (src/lib/firebase/client.js is "use client") and its default persistence
 * layer (indexedDB/localStorage) doesn't exist in a Node.js Server Action.
 * The REST endpoint just needs the public API key, same as the client SDK
 * uses under the hood.
 */
export async function sendInvitePasswordResetEmail(email) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Failed to send invite email: ${message}`);
  }
}
