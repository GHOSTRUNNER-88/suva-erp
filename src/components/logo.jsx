import Image from "next/image";

/**
 * Icon + wordmark lockup, reused anywhere the brand appears (auth pages,
 * dashboard header, etc). No explicit text color — inherits from its
 * container so it reads correctly on both the dark left panel and light
 * form panel without a separate "light/dark" variant.
 */
export function Logo({ size = 32, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image src="/logo.svg" alt="" width={size} height={size} priority />
      <span className="text-lg font-semibold tracking-tight">Suva ERP</span>
    </div>
  );
}
