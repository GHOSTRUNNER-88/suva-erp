"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Off-canvas panel — the one modal/drawer primitive for the app. Use this
 * instead of a separate full-page route for focused single-task flows
 * (add/invite user, quick edit) that don't need their own URL.
 */
export function Sheet({ open, onClose, title, children, side = "right" }) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            // Deliberately bg-black, not bg-foreground — --foreground flips
            // to near-white in dark mode, which washed the backdrop out to
            // gray instead of darkening it. A modal scrim should always
            // darken regardless of theme.
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: side === "right" ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "right" ? "100%" : "-100%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "fixed inset-y-0 z-50 flex w-full max-w-md flex-col bg-background shadow-2xl",
              side === "right" ? "right-0" : "left-0"
            )}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
