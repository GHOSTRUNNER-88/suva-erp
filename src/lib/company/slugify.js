/**
 * Pure, dependency-free — deliberately its own file so client components
 * (the signup form's live URL preview) can import it without dragging in
 * create-company.js's server-only imports (mysql2 et al.) into the
 * browser bundle.
 */
export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
