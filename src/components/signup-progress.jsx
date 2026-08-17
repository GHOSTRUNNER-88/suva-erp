"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";

const STEP_KEYS = ["signupStep1", "signupStep2", "signupStep3", "signupStep4", "signupStep5"];

/**
 * Full-screen overlay shown while signup is in flight — provisioning two
 * physical databases genuinely takes a couple of seconds, so a static
 * "loading…" button label undersells what's actually happening. Steps
 * are cosmetic (not tied to real backend progress) but ordered to match
 * create-company.js's actual sequence.
 */
export default function SignupProgress({ active }) {
  return (
    <AnimatePresence>
      {active && <SignupProgressOverlay />}
    </AnimatePresence>
  );
}

function SignupProgressOverlay() {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((i) => (i + 1 < STEP_KEYS.length ? i + 1 : i));
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/90 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative flex h-20 w-20 items-center justify-center"
      >
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/15 border-t-primary" />
        <svg
          viewBox="0 0 1080 1080"
          className="h-9 w-9 animate-suva-pulse"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M542.551 620.957C530.411 611.084 515.782 604.752 500.276 602.656C484.77 600.561 468.987 602.785 454.665 609.082C441.438 614.386 429.587 622.621 420.003 633.168C410.42 643.714 403.353 656.298 399.335 669.971C394.256 685.735 390.786 702.114 385.906 720.562C332.781 691.704 280.747 661.06 228.281 631.339C175.816 601.619 124.325 571.915 69.3202 539.802C194.767 466.024 319.367 397.463 443.726 323.638C444.377 328.432 444.779 333.255 444.931 338.09C442.366 405.66 467.844 462.154 513.545 510.734C537.985 537.101 568.039 557.636 601.484 570.819C652.549 590.929 703.105 613.165 752.967 635.704C782.645 647.804 808.304 668.039 826.992 694.078C835.849 706.335 840.915 720.92 841.565 736.028L850.019 973.893C849.86 977.827 849.483 981.748 848.891 985.64C845.019 984.234 841.225 982.625 837.522 980.819L625.404 855.522C606.504 844.34 586.811 834.291 568.868 821.591C554.053 811.58 540.656 799.616 529.039 786.022C500.611 750.818 501.458 711.35 517.577 671.266C522.371 658.851 529.48 647.606 535.571 635.6C538.172 630.914 540.307 626.594 542.551 620.957Z"
            fill="#F7B500"
            className="animate-suva-fade-a"
          />
          <path
            d="M725.337 162.787C765.522 135.148 808.079 116.463 850.224 89.0434C850.101 242.713 851.763 392.457 851.606 545.566C842.811 539.356 837.446 535.41 831.803 531.818C803.687 513.316 772.837 499.35 740.384 490.433C683.76 475.124 631.04 447.941 585.724 410.691C569.508 397.435 555.896 381.28 545.582 363.05C539.658 353.161 535.891 342.133 534.527 330.687C533.163 319.241 534.234 307.637 537.668 296.634C541.102 285.632 546.823 275.48 554.456 266.844C562.088 258.208 571.46 251.283 581.956 246.523C592.452 241.763 603.836 239.275 615.362 239.223C626.887 239.171 638.294 241.556 648.834 246.221C659.375 250.886 668.81 257.726 676.523 266.293C684.235 274.86 690.05 284.96 693.587 295.931C696.6 305.672 697.014 316.031 694.789 325.981C692.564 335.931 687.776 345.126 680.901 352.653C676.347 358.466 671.284 363.898 665.511 370.608C670.226 377.001 676.692 381.892 684.127 384.688C691.562 387.484 699.647 388.066 707.405 386.363C723.848 384.099 739.356 377.376 752.247 366.923C765.139 356.469 774.922 342.685 780.535 327.065C796.064 287.129 788.626 248.682 769.154 211.78C759.577 191.566 744.36 174.551 725.337 162.787Z"
            fill="#FFC928"
            className="animate-suva-fade-b"
          />
        </svg>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.p
          key={stepIndex}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="text-sm font-medium text-muted-foreground"
        >
          {t(STEP_KEYS[stepIndex])}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}
