"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Centered dialog — the other modal primitive alongside components/ui/
 * sheet.jsx's off-canvas panel. Use this for small, single-purpose forms
 * (a couple of fields) where a full-height side panel is overkill; keep
 * Sheet for anything with more fields or that benefits from more vertical
 * room (see e.g. the Party form vs. the Party Group form).
 */
export function Modal({ open, onClose, title, children, className }) {
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
            // Deliberately bg-black, not bg-foreground — see sheet.jsx's
            // note, same dark-mode scrim bug avoided here.
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn("flex w-full max-w-md flex-col rounded-2xl bg-background shadow-2xl", className)}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="text-lg font-semibold">{title}</h2>
                <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
