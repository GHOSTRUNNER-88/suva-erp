"use server";

import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { expenseCategories, expenses } from "@/db/schema/organization";
import { getAuthenticatedAppContext } from "@/lib/auth/app-context";
import { getOrganizationDb } from "@/lib/db";
import { z } from "zod";

/**
 * Ported from legacy `expense_categories` (APP-REPORT.md §7.6, verified
 * against models/Expense.php in full) — a simple named list, same shape as
 * Item Categories (see items/actions.js's itemCategorySchema). "Salary" is
 * load-bearing elsewhere (VAT force-disable in ../expenses/actions.js, and
 * eventually payroll) but is given no special protection here — legacy
 * doesn't block renaming/deleting it either, see @/../AGENTS.md §6.
 */
const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, "expenseCategoryNameRequired").max(150, "expenseCategoryNameTooLong"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

// Exact legacy seed list (verified names only — models/Expense.php's own
// INSERT IGNORE seed carries no description text to port, so these start
// with description: null and can be filled in later like any other
// category). Order matches the task brief / legacy seed order.
const DEFAULT_EXPENSE_CATEGORY_NAMES = [
  "Salary",
  "Rent",
  "Utilities",
  "Transportation (TA/DA)",
  "Office Supplies",
  "Maintenance & Repairs",
  "Marketing & Advertising",
  "Meals & Entertainment",
  "Insurance",
  "Miscellaneous",
];

function canAccessPurchase(context) {
  return context.accessibleModules.includes("purchase");
}

async function categoryNameExists(db, name, exceptId) {
  const where = exceptId
    ? and(eq(expenseCategories.name, name), ne(expenseCategories.id, exceptId))
    : eq(expenseCategories.name, name);
  const existing = await db.select({ id: expenseCategories.id }).from(expenseCategories).where(where).limit(1);
  return existing.length > 0;
}

/**
 * One-time seed for a brand-new Organization — mirrors legacy's INSERT
 * IGNORE default rows exactly (see DEFAULT_EXPENSE_CATEGORY_NAMES above).
 * Takes a raw `db` handle, not a companySlug — same shape as
 * lib/party-ledger.js's recalculatePartyBalance, since it needs to run
 * before any authenticated request context exists for a new Organization
 * (called from setup/actions.js's Organization-creation flow — not wired up
 * here, see this task's handoff note). Simplest possible guard per the
 * brief: skip entirely once the table has any row at all, since this only
 * ever needs to run once per Organization.
 */
export async function seedDefaultExpenseCategories(db) {
  const existing = await db.select({ id: expenseCategories.id }).from(expenseCategories).limit(1);
  if (existing.length > 0) return;
  await db.insert(expenseCategories).values(
    DEFAULT_EXPENSE_CATEGORY_NAMES.map((name) => ({ name, description: null }))
  );
}

// Mirrors items/actions.js's listItemCategories itemCount pattern.
export async function listExpenseCategories(companySlug) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) return [];
  const db = getOrganizationDb(context.session.organizationDbName);
  return db
    .select({
      id: expenseCategories.id,
      name: expenseCategories.name,
      description: expenseCategories.description,
      expenseCount: count(expenses.id),
    })
    .from(expenseCategories)
    .leftJoin(expenses, eq(expenses.categoryId, expenseCategories.id))
    .groupBy(expenseCategories.id)
    .orderBy(asc(expenseCategories.name));
}

export async function createExpenseCategoryAction(companySlug, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = expenseCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  if (await categoryNameExists(db, data.name)) {
    return { ok: false, fieldErrors: { name: ["expenseCategoryNameExists"] } };
  }

  const [{ id }] = await db
    .insert(expenseCategories)
    .values({ name: data.name, description: data.description || null })
    .$returningId();

  revalidatePath(`/${companySlug}/purchase/expense-categories`);
  revalidatePath(`/${companySlug}/purchase/expenses`);
  // id/name mirror createItemCategoryAction's shape — lets the Expense
  // form's CreatableSelect quick-add select the freshly created category
  // immediately instead of only refreshing the underlying list.
  return { ok: true, message: "expenseCategoryCreated", id, name: data.name };
}

export async function updateExpenseCategoryAction(companySlug, categoryId, input) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, fieldErrors: {}, formError: "notAllowed" };
  }

  const parsed = expenseCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const id = Number(categoryId);
  const data = parsed.data;
  const db = getOrganizationDb(context.session.organizationDbName);

  const [existing] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.id, id))
    .limit(1);
  if (!existing) {
    return { ok: false, fieldErrors: {}, formError: "expenseCategoryNotFound" };
  }
  if (await categoryNameExists(db, data.name, id)) {
    return { ok: false, fieldErrors: { name: ["expenseCategoryNameExists"] } };
  }

  await db
    .update(expenseCategories)
    .set({ name: data.name, description: data.description || null })
    .where(eq(expenseCategories.id, id));

  revalidatePath(`/${companySlug}/purchase/expense-categories`);
  revalidatePath(`/${companySlug}/purchase/expenses`);
  return { ok: true, message: "expenseCategoryUpdated" };
}

export async function deleteExpenseCategoriesAction(companySlug, categoryIds) {
  const context = await getAuthenticatedAppContext(companySlug);
  if (!canAccessPurchase(context)) {
    return { ok: false, formError: "notAllowed" };
  }

  const ids = (Array.isArray(categoryIds) ? categoryIds : [categoryIds]).map(Number).filter(Number.isInteger);
  if (ids.length === 0) {
    return { ok: false, formError: "expenseCategoryNotFound" };
  }

  const db = getOrganizationDb(context.session.organizationDbName);
  // Matches legacy delete_expense_category(): expenses keep their row,
  // category_id just falls back to NULL (schema FK is ON DELETE SET NULL,
  // see @/db/schema/organization.js) — no "in use" guard, deletion never
  // blocks even when expenses reference this category.
  await db.delete(expenseCategories).where(inArray(expenseCategories.id, ids));

  revalidatePath(`/${companySlug}/purchase/expense-categories`);
  revalidatePath(`/${companySlug}/purchase/expenses`);
  return { ok: true, message: "expenseCategoriesDeleted", count: ids.length };
}
