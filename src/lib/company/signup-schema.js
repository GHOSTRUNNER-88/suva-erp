import { z } from "zod";

/**
 * Validates the COMPANY details submitted alongside a signup. Deliberately
 * does NOT include email/password — those go through Firebase directly
 * (client SDK), and the server action re-derives the verified email from
 * the Firebase ID token rather than trusting a client-submitted field.
 */
export const signupSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is too short").max(180),
  slug: z
    .string()
    .trim()
    .min(2, "URL is too short")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  panNumber: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "PAN number must be 9 digits"),
  ownerFirstName: z.string().trim().min(1, "First name is required").max(100),
  ownerLastName: z.string().trim().max(100).optional().or(z.literal("")),
});
