import { toast } from "sonner";

/**
 * One import site for toasts app-wide (mirrors pickLocalized/cn in
 * lib/utils.js) — callers pass already-translated messages (t("...")), this
 * module never renders its own copy.
 */
export const notify = {
  success: (message, options) => toast.success(message, options),
  error: (message, options) => toast.error(message, options),
  info: (message, options) => toast.info(message, options),
  promise: (promise, messages, options) => toast.promise(promise, { ...messages, ...options }),
};
