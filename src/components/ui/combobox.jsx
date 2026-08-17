"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Searchable select: type to filter `options`, click one to choose it — but
 * unlike a native <select>, typing anything not in the list is still a
 * valid value (covers "Other" + a custom entry without a separate branch;
 * the backing field must accept free text, not a strict enum).
 */
export function Combobox({ options, value, onChange, placeholder, id, className = "" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = value ?? "";
  const filtered = query
    ? options.filter((option) => option.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          value={query}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11 pr-8"
        />
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={cn(
                "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-muted",
                value === option && "bg-muted font-medium"
              )}
            >
              {option}
              {value === option && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
