"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Multi-step progress indicator. The current step always counts as
 * in-progress, never "not started" — step 1 of N never renders as 0%, it
 * renders as 1/N already filled, with its own circle active rather than
 * empty. Steps before `currentStep` render as completed (checkmark).
 */
export function StepProgress({ steps, currentStep }) {
  const percent = Math.round((currentStep / steps.length) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{steps[currentStep - 1]?.label}</span>
        <span className="font-semibold text-primary">{percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-start justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const done = stepNumber < currentStep;
          const active = stepNumber === currentStep;
          return (
            <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-muted-foreground/30 text-muted-foreground/60"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : stepNumber}
              </div>
              <span className={cn("text-[11px] font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
