"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Backpack,
  BatteryCharging,
  Baby,
  Beef,
  Bed,
  Bike,
  Book,
  BookOpen,
  Box,
  Boxes,
  Briefcase,
  Brush,
  Building2,
  Cable,
  Calculator,
  Camera,
  Car,
  ChevronDown,
  Coffee,
  CupSoda,
  Dog,
  Droplet,
  Drill,
  Factory,
  Fish,
  Flame,
  Flower2,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  HardDrive,
  HeartPulse,
  Headphones,
  Home,
  Keyboard,
  Key,
  Lamp,
  Laptop,
  Layers,
  Lightbulb,
  Luggage,
  Monitor,
  Mouse,
  Package,
  PaintBucket,
  Palette,
  Pill,
  Plug,
  Printer,
  Router,
  Ruler,
  Scissors,
  Search,
  Shirt,
  Shovel,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Snowflake,
  Sofa,
  Speaker,
  Stethoscope,
  Store,
  Tablet,
  Tag,
  Truck,
  Tv,
  Umbrella,
  Utensils,
  Warehouse,
  Watch,
  Wheat,
  Wine,
  Wrench,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Curated, not the full lucide catalog (1000+ icons) — nobody browsing a
// category-icon picker has "icon codes" memorized, so this stays a short,
// relevant list for a retail/wholesale ERP rather than an overwhelming
// alphabet-soup grid. Keyed by the exact lucide-react export name, which is
// also what gets stored (itemCategories.icon) and re-rendered elsewhere.
export const ICON_OPTIONS = [
  { name: "Package", Icon: Package },
  { name: "ShoppingCart", Icon: ShoppingCart },
  { name: "ShoppingBag", Icon: ShoppingBag },
  { name: "Shirt", Icon: Shirt },
  { name: "Utensils", Icon: Utensils },
  { name: "Coffee", Icon: Coffee },
  { name: "CupSoda", Icon: CupSoda },
  { name: "Wine", Icon: Wine },
  { name: "Wheat", Icon: Wheat },
  { name: "Fish", Icon: Fish },
  { name: "Beef", Icon: Beef },
  { name: "Laptop", Icon: Laptop },
  { name: "Smartphone", Icon: Smartphone },
  { name: "Tablet", Icon: Tablet },
  { name: "Watch", Icon: Watch },
  { name: "Tv", Icon: Tv },
  { name: "Camera", Icon: Camera },
  { name: "Headphones", Icon: Headphones },
  { name: "Speaker", Icon: Speaker },
  { name: "Gamepad2", Icon: Gamepad2 },
  { name: "Monitor", Icon: Monitor },
  { name: "Printer", Icon: Printer },
  { name: "Keyboard", Icon: Keyboard },
  { name: "Mouse", Icon: Mouse },
  { name: "Router", Icon: Router },
  { name: "HardDrive", Icon: HardDrive },
  { name: "Cable", Icon: Cable },
  { name: "Plug", Icon: Plug },
  { name: "BatteryCharging", Icon: BatteryCharging },
  { name: "Car", Icon: Car },
  { name: "Bike", Icon: Bike },
  { name: "Truck", Icon: Truck },
  { name: "Fuel", Icon: Fuel },
  { name: "Wrench", Icon: Wrench },
  { name: "Hammer", Icon: Hammer },
  { name: "Drill", Icon: Drill },
  { name: "Shovel", Icon: Shovel },
  { name: "PaintBucket", Icon: PaintBucket },
  { name: "Book", Icon: Book },
  { name: "BookOpen", Icon: BookOpen },
  { name: "GraduationCap", Icon: GraduationCap },
  { name: "Pill", Icon: Pill },
  { name: "HeartPulse", Icon: HeartPulse },
  { name: "Stethoscope", Icon: Stethoscope },
  { name: "Home", Icon: Home },
  { name: "Sofa", Icon: Sofa },
  { name: "Bed", Icon: Bed },
  { name: "Lamp", Icon: Lamp },
  { name: "Gift", Icon: Gift },
  { name: "Layers", Icon: Layers },
  { name: "Tag", Icon: Tag },
  { name: "Box", Icon: Box },
  { name: "Boxes", Icon: Boxes },
  { name: "Lightbulb", Icon: Lightbulb },
  { name: "Droplet", Icon: Droplet },
  { name: "Flame", Icon: Flame },
  { name: "Snowflake", Icon: Snowflake },
  { name: "Baby", Icon: Baby },
  { name: "Dog", Icon: Dog },
  { name: "Flower2", Icon: Flower2 },
  { name: "Scissors", Icon: Scissors },
  { name: "Palette", Icon: Palette },
  { name: "Brush", Icon: Brush },
  { name: "Ruler", Icon: Ruler },
  { name: "Calculator", Icon: Calculator },
  { name: "Briefcase", Icon: Briefcase },
  { name: "Key", Icon: Key },
  { name: "Umbrella", Icon: Umbrella },
  { name: "Backpack", Icon: Backpack },
  { name: "Luggage", Icon: Luggage },
  { name: "Building2", Icon: Building2 },
  { name: "Store", Icon: Store },
  { name: "Factory", Icon: Factory },
  { name: "Warehouse", Icon: Warehouse },
];

const ICON_BY_NAME = new Map(ICON_OPTIONS.map((option) => [option.name, option.Icon]));

// Splits "ShoppingCart" -> "Shopping Cart" so search matches how someone
// would actually type it, not the raw PascalCase export name.
function readableName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

export function CategoryIcon({ name, className }) {
  return createElement(ICON_BY_NAME.get(name) ?? Package, { className });
}

/**
 * Searchable icon grid — the picker for itemCategories.icon. Never expects
 * anyone to type a raw icon code; you search by what the icon looks like
 * ("cart", "shirt", "medicine"...) and click it. Same portal-to-body +
 * getBoundingClientRect positioning as data-table.jsx's TableFilterSelect,
 * for the same reason: this can be opened from inside a Sheet/Modal, and a
 * plain in-tree absolute popover would get clipped by that container's
 * bounds instead of floating above it.
 */
export function IconPicker({ value, onChange, placeholder, id }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const SelectedIcon = value ? (ICON_BY_NAME.get(value) ?? Package) : null;

  function openPopover() {
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 288) });
    setOpen(true);
  }

  function closePopover() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      if (triggerRef.current?.contains(event.target)) return;
      if (popoverRef.current?.contains(event.target)) return;
      closePopover();
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", closePopover, true);
    window.addEventListener("resize", closePopover);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", closePopover, true);
      window.removeEventListener("resize", closePopover);
    };
  }, [open]);

  const trimmedQuery = query.trim().toLowerCase();
  const filteredIcons = trimmedQuery
    ? ICON_OPTIONS.filter((option) => readableName(option.name).toLowerCase().includes(trimmedQuery))
    : ICON_OPTIONS;

  return (
    <div className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePopover() : openPopover())}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-transparent bg-muted/60 px-3 text-sm transition-colors hover:bg-muted"
      >
        {SelectedIcon ? (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            {createElement(SelectedIcon, { className: "h-3.5 w-3.5" })}
          </span>
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-muted-foreground/10 text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
          </span>
        )}
        <span className={cn("flex-1 truncate text-left", !value && "text-muted-foreground")}>
          {value ? readableName(value) : (placeholder ?? t("selectIcon"))}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: position.top, left: position.left, width: position.width }}
            className="z-50 rounded-xl border bg-popover p-2 shadow-lg"
          >
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-8 w-full rounded-lg border border-transparent bg-muted/60 pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            {filteredIcons.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("noResults")}</p>
            ) : (
              <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
                {filteredIcons.map((option) => (
                  <button
                    key={option.name}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(option.name);
                      closePopover();
                    }}
                    title={readableName(option.name)}
                    aria-label={readableName(option.name)}
                    className={cn(
                      "grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      value === option.name && "bg-primary/15 text-primary"
                    )}
                  >
                    <option.Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
