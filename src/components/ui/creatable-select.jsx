"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// <CreatableSelect options={[{ value: 1, label: "Wholesale" }]} value={form.groupId}
//   onChange={(value) => update("groupId", value)} placeholder={t("selectGroup")}
//   onCreate={async (name) => {
//     const result = await createGroupAction(companySlug, { name });
//     if (!result.ok) { notify.error(t(result.formError)); return null; }
//     router.refresh();
//     return { value: result.id, label: name };
//   }} />
//
// <CreatableSelect options={...} value={...} onChange={...}
//   createNewLabel={t("addPartyGroup")}
//   onCreateNew={() => new Promise((resolve) => {
//     // caller opens its own modal, resolves with { value, label } on
//     // success or null on cancel — see parties-view.jsx/items-view.jsx.
//     setQuickAdd({ resolve });
//   })} />

/**
 * Searchable id/label select (unlike components/ui/combobox.jsx, which is
 * free-text-value — this one is for picking a related record by id).
 *
 * Two independent, combinable ways to create a new option inline instead of
 * leaving the form to go manage the list elsewhere:
 * - `onCreate(typedName)`: type a name that doesn't match anything and a
 *   "Create '<name>'" row appears — for entities a bare name is enough to
 *   create (party group, item category description-less quick case).
 * - `onCreateNew()`: a "+ <createNewLabel>" row PINNED at the top of the
 *   list, always visible (not conditional on typing) — for entities that
 *   need a real small form to create (a unit needs a code + type, a party
 *   group/category benefit from also setting description/icon up front).
 *   Both resolve the same way: return `{ value, label }` on success or
 *   `null` on cancel; the caller owns whatever modal/UI collects the extra
 *   fields, this component just awaits the result and selects it.
 */
export function CreatableSelect({
  options,
  value,
  onChange,
  onCreate,
  onCreateNew,
  createNewLabel,
  placeholder,
  emptyLabel,
  id,
  className = "",
  disabled = false,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  // Covers the gap between a successful create and the parent's `options`
  // prop catching up (usually via router.refresh()) — without this the
  // input would flash blank/wrong.
  const [pendingLabel, setPendingLabel] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((option) => String(option.value) === String(value));
  const displayLabel = selectedOption?.label ?? pendingLabel ?? "";

  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? options.filter((option) => option.label.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : options;
  const exactMatch = options.some((option) => option.label.toLowerCase() === trimmedQuery.toLowerCase());
  const canCreate = Boolean(onCreate) && trimmedQuery.length > 0 && !exactMatch;

  function select(option) {
    onChange(option.value);
    setPendingLabel(null);
    setOpen(false);
    setQuery("");
  }

  async function handleCreate() {
    if (!trimmedQuery || creating) return;
    setCreating(true);
    const result = await onCreate(trimmedQuery);
    setCreating(false);
    if (result) {
      setPendingLabel(result.label ?? trimmedQuery);
      onChange(result.value);
      setOpen(false);
      setQuery("");
    }
  }

  async function handleCreateNew() {
    if (creatingNew) return;
    setOpen(false);
    setQuery("");
    setCreatingNew(true);
    const result = await onCreateNew();
    setCreatingNew(false);
    if (result) {
      setPendingLabel(result.label);
      onChange(result.value);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          value={open ? query : displayLabel}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled || creatingNew}
          className="h-11 pr-8"
        />
        {creatingNew ? (
          <Loader2 className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
          {onCreateNew && (
            <>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleCreateNew}
                className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/8"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{createNewLabel ?? t("createNewOption", { value: "" })}</span>
              </button>
              <div className="my-1 h-px bg-border" />
            </>
          )}
          {filtered.length === 0 && !canCreate && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel ?? t("noResults")}</p>
          )}
          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(option)}
              className={cn(
                "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-muted",
                String(value) === String(option.value) && "bg-muted font-medium"
              )}
            >
              <span className="truncate">{option.label}</span>
              {String(value) === String(option.value) && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleCreate}
              disabled={creating}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/8 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Plus className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{t("createNewOption", { value: trimmedQuery })}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
