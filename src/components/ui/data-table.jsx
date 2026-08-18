"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronsUpDown, Inbox, Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// <DataTable columns={[{ key: "name", header: t("name"), sortable: true, render: (row) => row.name }]}
//   rows={rows} getRowId={(row) => row.id} selectedIds={selected} onSelectionChange={setSelected}
//   onRowClick={(row) => router.push(...)} searchKeys={["name", "email"]}
//   filters={[{ key: "partyGroupId", label: t("partyGroup"),
//     options: partyGroups.map((g) => ({ value: String(g.id), label: g.name })) }]}
//   rowActions={(row) => [
//     { key: "edit", label: t("edit"), icon: Pencil, onClick: () => openEdit(row) },
//     { key: "delete", label: t("delete"), icon: Trash2, variant: "destructive", onClick: () => handleDelete(row) },
//   ]}
//   bulkActions={(ids, { clearSelection }) => [
//     { key: "delete", label: t("delete"), icon: Trash2, variant: "destructive", loading: deleting,
//       onClick: () => handleBulkDelete(ids, { clearSelection }) },
//   ]}
//   emptyIcon={Users} emptyMessage={t("noPartiesYet")} emptyAction={{ label: t("addParty"), onClick: openCreate }} />
//
// One shared table for every module page (parties, items, invoices, ...) so
// they all get the same look for free instead of each page hand-rolling its
// own action-column buttons, bulk-action bar, and filter chips: pass
// columns/rows/actions/filters declaratively and this component renders all
// of the chrome. `emptyState` remains as a full-override escape hatch (raw
// ReactNode) for the rare case a table's empty panel needs genuinely
// bespoke content instead of the standard icon+message+action shape.

const VIRTUALIZE_THRESHOLD = 30;
const DEFAULT_ROW_HEIGHT = 40;
const SKELETON_ROW_COUNT = 8;
const ACTION_BUTTON_SIZE = 32;
const ACTION_BUTTON_GAP = 4;
const ACTIONS_CELL_PADDING = 16;

function toSelectionSet(value) {
  return value instanceof Set ? value : new Set(value ?? []);
}

function actionsCellWidth(count) {
  if (count <= 0) return 0;
  return ACTIONS_CELL_PADDING * 2 + count * ACTION_BUTTON_SIZE + (count - 1) * ACTION_BUTTON_GAP;
}

/**
 * Generic list/table for module pages (parties, items, invoices, ...) — the
 * one shared table so every page gets multi-select, virtualization, and
 * bilingual empty/loading states for free instead of hand-rolling its own.
 *
 * Sorting is internal state (click a sortable header: asc -> desc -> none),
 * comparing the raw `row[column.key]` value — not `column.render()`'s
 * output. Selection is controllable (`selectedIds` + `onSelectionChange`)
 * but falls back to internal state so a caller that doesn't care about
 * selection elsewhere still works without wiring anything up.
 */
export function DataTable({
  columns,
  rows,
  getRowId = (row) => row.id,
  selectable = true,
  selectedIds,
  onSelectionChange,
  // (row) => [{ key, label, icon, onClick, variant?: "destructive", disabled? }]
  // — rendered as the table's own trailing "actions" column, sized to fit.
  rowActions,
  // (selectedIds, { clearSelection }) => [{ key, label, icon?, onClick,
  // variant?, disabled?, loading? }] — rendered in the selection bar.
  bulkActions,
  // [{ key, label, options: [{ value, label }] }] — one searchable filter
  // chip per entry, rendered next to the search box. `key` is matched
  // against `row[key]` (coerced to string), so it's usually a foreign-key
  // id column like partyGroupId, not the display-name column.
  filters,
  // Full override for the empty panel's content. Leave unset to use the
  // standard icon+message+action shape via emptyIcon/emptyMessage/emptyAction.
  emptyState,
  emptyIcon,
  emptyMessage,
  // Optional second line explaining what the page is for / what to do —
  // keep emptyMessage short ("No sales orders yet") and put the "why/what
  // next" sentence here, see redesign2.md's empty-state rule.
  emptyDescription,
  // { label, onClick, icon? } — icon defaults to Plus. Omit this when the
  // page already has a PageHeader primary action for the same thing —
  // repeating the identical button here is the exact duplication
  // redesign2.md calls out; this prop stays for pages with no page-level
  // action elsewhere.
  emptyAction,
  loading = false,
  onRowClick,
  rowHeight = DEFAULT_ROW_HEIGHT,
  maxHeight = "min(70vh, 640px)",
  className,
  searchable = true,
  searchPlaceholder,
  // Which row fields to match against — defaults to every column's key,
  // since that's what's actually visible to the user searching.
  searchKeys,
}) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const [sortState, setSortState] = useState({ key: null, direction: null });
  const [internalSelected, setInternalSelected] = useState(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterValues, setFilterValues] = useState({});
  const EmptyIcon = emptyIcon;
  const EmptyActionIcon = emptyAction?.icon ?? Plus;

  function setFilterValue(key, value) {
    setFilterValues((current) => {
      const next = { ...current };
      if (value == null) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const isSelectionControlled = selectedIds !== undefined;
  const selected = isSelectionControlled ? toSelectionSet(selectedIds) : internalSelected;

  function updateSelection(next) {
    if (!isSelectionControlled) setInternalSelected(next);
    onSelectionChange?.(next);
  }

  function clearSelection() {
    updateSelection(new Set());
  }

  const effectiveSearchKeys = searchKeys ?? columns.map((column) => column.key);
  const filterValuesSignature = filters ? filters.map((filter) => `${filter.key}:${filterValues[filter.key] ?? ""}`).join("|") : "";

  const filteredRows = useMemo(() => {
    let result = rows;
    if (filters?.length) {
      result = result.filter((row) =>
        filters.every((filter) => {
          const selected = filterValues[filter.key];
          return selected == null || selected === "" || String(row[filter.key]) === String(selected);
        })
      );
    }
    const query = searchQuery.trim().toLowerCase();
    if (searchable && query) {
      result = result.filter((row) =>
        effectiveSearchKeys.some((key) => {
          const value = row[key];
          return value != null && String(value).toLowerCase().includes(query);
        })
      );
    }
    return result;
    // effectiveSearchKeys/filterValuesSignature are derived fresh each
    // render — comparing their contents, not the object/array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, searchable, searchQuery, effectiveSearchKeys.join("|"), filters, filterValuesSignature]);

  const sortedRows = useMemo(() => {
    if (!sortState.key || !sortState.direction) return filteredRows;
    const sorted = [...filteredRows].sort((a, b) => {
      const av = a[sortState.key];
      const bv = b[sortState.key];
      if (av == null && bv == null) return 0;
      if (av == null) return -1;
      if (bv == null) return 1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return sortState.direction === "desc" ? sorted.reverse() : sorted;
  }, [filteredRows, sortState]);

  function cycleSort(column) {
    if (!column.sortable) return;
    setSortState((current) => {
      if (current.key !== column.key) return { key: column.key, direction: "asc" };
      if (current.direction === "asc") return { key: column.key, direction: "desc" };
      return { key: null, direction: null };
    });
  }

  const allIds = useMemo(() => sortedRows.map(getRowId), [sortedRows, getRowId]);
  const selectedVisibleCount = allIds.reduce((count, id) => (selected.has(id) ? count + 1 : count), 0);
  const allSelected = allIds.length > 0 && selectedVisibleCount === allIds.length;
  const someSelected = selectedVisibleCount > 0 && !allSelected;

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) {
      allIds.forEach((id) => next.delete(id));
    } else {
      allIds.forEach((id) => next.add(id));
    }
    updateSelection(next);
  }

  function toggleRow(id) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    updateSelection(next);
  }

  const shouldVirtualize = sortedRows.length > VIRTUALIZE_THRESHOLD;
  // Always called (rules of hooks) — its output is simply unused below the
  // threshold, where rows render in plain flow instead.
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  // Fixed regardless of sorting/filtering, so the actions column never
  // changes width as the user searches — computed off the full row set,
  // not just what's currently visible.
  const actionsWidth = useMemo(() => {
    if (!rowActions) return 0;
    const maxCount = rows.reduce((max, row) => Math.max(max, rowActions(row).length), 0);
    return actionsCellWidth(maxCount);
  }, [rowActions, rows]);

  const bulkActionList = selectable && selected.size > 0 ? (bulkActions?.(selected, { clearSelection }) ?? []) : [];

  // A table with zero rows to begin with has nothing to search or sort —
  // showing the search bar and column headers above a lone sentence of
  // empty space reads as broken chrome, not an intentional empty state.
  // Only show that chrome once there's actually data (or a load in flight)
  // for it to act on; a search that filtered everything out is a different
  // case (handled below) and keeps the chrome, since clearing the query is
  // the way out of it.
  const isGenuinelyEmpty = !loading && rows.length === 0;

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-background", className)}>
      {(searchable || filters?.length > 0) && !isGenuinelyEmpty && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {searchable && (
            <div className="relative max-w-xs min-w-40 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={searchPlaceholder ?? t("searchPlaceholder")}
                className="h-9 w-full min-w-0 rounded-lg border border-transparent bg-muted/60 py-1 pr-8 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label={t("clearSelection")}
                  className="absolute top-1/2 right-1.5 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {filters?.map((filter) => (
            <TableFilterSelect
              key={filter.key}
              filter={filter}
              value={filterValues[filter.key]}
              onChange={(value) => setFilterValue(filter.key, value)}
              t={t}
            />
          ))}
        </div>
      )}
      <AnimatePresence initial={false}>
        {bulkActionList.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex items-center gap-3 border-b border-l-2 border-l-primary bg-primary/8 px-4 py-2.5"
          >
            <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
              {t("featuresSelectedCount", { count: selected.size })}
            </span>
            <div className="mx-1 h-5 w-px shrink-0 bg-border" />
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {bulkActionList.map((action) => (
                <Button
                  key={action.key}
                  type="button"
                  size="sm"
                  variant={action.variant ?? "outline"}
                  disabled={action.disabled || action.loading}
                  onClick={action.onClick}
                >
                  {action.loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    action.icon && <action.icon className="h-3.5 w-3.5" />
                  )}
                  {action.label}
                </Button>
              ))}
            </div>
            <button
              type="button"
              onClick={clearSelection}
              aria-label={t("clearSelection")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isGenuinelyEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-12 text-center">
          {emptyState ?? (
            <>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-muted/60">
                {EmptyIcon ? <EmptyIcon className="h-5 w-5 text-muted-foreground" /> : <Inbox className="h-5 w-5 text-muted-foreground" />}
              </div>
              <p className="text-sm font-medium text-foreground">{emptyMessage ?? t("noResults")}</p>
              {emptyDescription && <p className="max-w-sm text-xs text-muted-foreground">{emptyDescription}</p>}
              {emptyAction && (
                <Button type="button" size="sm" className="mt-1" onClick={emptyAction.onClick}>
                  <EmptyActionIcon className="h-3.5 w-3.5" />
                  {emptyAction.label}
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="overflow-auto" style={{ maxHeight }}>
          <div className="sticky top-0 z-10 flex items-stretch border-b bg-muted/60 backdrop-blur-sm">
            {selectable && (
              <div className="flex w-11 shrink-0 items-center justify-center px-2">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={toggleAll}
                  disabled={sortedRows.length === 0}
                  aria-label={t("selectAll")}
                />
              </div>
            )}
            {columns.map((column) => (
              <div
                key={column.key}
                className={cn(
                  "flex flex-1 min-w-0 items-center px-4 py-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase",
                  column.className
                )}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => cycleSort(column)}
                    aria-label={t("sort")}
                    // Buttons don't reliably inherit text-transform from an
                    // ancestor (browsers' UA stylesheet resets it on form
                    // controls) — without this, a sortable header renders in
                    // its original case while every non-sortable header next
                    // to it is uppercase, breaking the header row's rhythm.
                    className="inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground"
                  >
                    {column.header}
                    {sortState.key === column.key ? (
                      sortState.direction === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </div>
            ))}
            {rowActions && (
              <div
                // min-w-0: without it, a flex item's default min-width:auto
                // floors it at its content's min-content size, so this cell
                // would refuse to shrink below "Actions"'s text width even
                // when actionsWidth is 0 (every row has zero actions) —
                // while the matching body cells below correctly collapse to
                // 0px (empty content), throwing every column after this one
                // out of alignment with the header.
                className="flex min-w-0 shrink-0 items-center justify-end overflow-hidden px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                style={{ flex: `0 0 ${actionsWidth}px` }}
              >
                {t("actions")}
              </div>
            )}
          </div>

          {loading ? (
            <SkeletonRows columns={columns} selectable={selectable} rowHeight={rowHeight} actionsWidth={actionsWidth} />
          ) : sortedRows.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground"
              style={{ minHeight: rowHeight * 4 }}
            >
              <Inbox className="h-8 w-8 opacity-40" />
              <p className="text-sm">{t("noResults")}</p>
            </div>
          ) : shouldVirtualize ? (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = sortedRows[virtualRow.index];
                const id = getRowId(row);
                return (
                  <Row
                    key={id}
                    row={row}
                    columns={columns}
                    selectable={selectable}
                    selected={selected.has(id)}
                    onToggle={() => toggleRow(id)}
                    onRowClick={onRowClick}
                    rowActions={rowActions}
                    actionsWidth={actionsWidth}
                    t={t}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  />
                );
              })}
            </div>
          ) : (
            sortedRows.map((row) => {
              const id = getRowId(row);
              return (
                <Row
                  key={id}
                  row={row}
                  columns={columns}
                  selectable={selectable}
                  selected={selected.has(id)}
                  onToggle={() => toggleRow(id)}
                  onRowClick={onRowClick}
                  rowActions={rowActions}
                  actionsWidth={actionsWidth}
                  t={t}
                  style={{ height: rowHeight }}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Row({ row, columns, selectable, selected, onToggle, onRowClick, rowActions, actionsWidth, t, style }) {
  return (
    <div
      style={style}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      className={cn(
        "flex items-stretch border-b transition-colors last:border-b-0",
        onRowClick && "cursor-pointer hover:bg-muted/50",
        selected && "bg-primary/8"
      )}
    >
      {selectable && (
        <div
          className="flex w-11 shrink-0 items-center justify-center px-2"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={t("selectRow")} />
        </div>
      )}
      {columns.map((column) => (
        <div
          key={column.key}
          className={cn("flex flex-1 min-w-0 items-center truncate px-4 text-sm", column.className)}
        >
          {column.render ? column.render(row) : row[column.key]}
        </div>
      ))}
      {rowActions && (
        <div
          className="flex min-w-0 shrink-0 items-center justify-end gap-1 overflow-hidden px-4"
          style={{ flex: `0 0 ${actionsWidth}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          {rowActions(row).map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => action.onClick(row)}
              disabled={action.disabled}
              aria-label={action.label}
              title={action.label}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors disabled:opacity-50",
                action.variant === "destructive"
                  ? "hover:bg-destructive/10 hover:text-destructive"
                  : "hover:bg-muted hover:text-foreground"
              )}
            >
              <action.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonRows({ columns, selectable, rowHeight, actionsWidth }) {
  return Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
    <div key={index} style={{ height: rowHeight }} className="flex items-stretch border-b last:border-b-0">
      {selectable && (
        <div className="flex w-11 shrink-0 items-center justify-center px-2">
          <div className="h-4 w-4 animate-pulse rounded-[4px] bg-muted" />
        </div>
      )}
      {columns.map((column) => (
        <div key={column.key} className={cn("flex flex-1 min-w-0 items-center px-4", column.className)}>
          <div className="h-4 w-full max-w-40 animate-pulse rounded bg-muted" />
        </div>
      ))}
      {actionsWidth > 0 && (
        <div className="flex shrink-0 items-center justify-end px-4" style={{ flex: `0 0 ${actionsWidth}px` }}>
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        </div>
      )}
    </div>
  ));
}

// Toolbar filter chip: shows the filter's label until a value is picked,
// then shows that option's label with a clear (X) button in its place —
// same visual language as the search box's own clear button. Options are
// searchable via a text field inside the popover, same interaction as
// components/ui/creatable-select.jsx minus the inline "add new" affordance
// (a filter picks among existing values, it doesn't create new ones).
//
// The popover is portaled to document.body instead of absolutely positioned
// inside the table card: the table's own wrapper is `overflow-hidden`
// (needed so its rounded corners actually clip square-cornered children —
// see data-table.jsx's top-of-file history), and a plain in-tree `absolute`
// popover collided visually with the sticky column header/first rows
// sitting directly beneath the trigger instead of floating cleanly above
// the whole page. Position is computed from the trigger's own
// getBoundingClientRect() and closes on scroll/resize rather than tracking
// them, matching how most lightweight menus behave.
function TableFilterSelect({ filter, value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  function openPopover() {
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 224) });
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
    // capture:true so this also fires for scrolls inside the table's own
    // scroll container (scroll events don't bubble, but do capture).
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", closePopover, true);
    window.addEventListener("resize", closePopover);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", closePopover, true);
      window.removeEventListener("resize", closePopover);
    };
  }, [open]);

  const selected = filter.options.find((option) => String(option.value) === String(value));
  const trimmedQuery = query.trim().toLowerCase();
  const filteredOptions = trimmedQuery
    ? filter.options.filter((option) => option.label.toLowerCase().includes(trimmedQuery))
    : filter.options;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePopover() : openPopover())}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border text-sm transition-colors",
          selected ? "border-primary/30 bg-primary/8 pr-7 pl-3 text-foreground" : "border-transparent bg-muted/60 px-3 text-muted-foreground hover:bg-muted"
        )}
      >
        <span className="max-w-32 truncate">{selected ? selected.label : filter.label}</span>
        {!selected && <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />}
      </button>
      {selected && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange(null);
          }}
          aria-label={t("clearFilter", { label: filter.label })}
          className="absolute top-1/2 right-1.5 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: position.top, left: position.left, width: position.width }}
            className="z-50 rounded-lg border bg-popover p-1 shadow-lg"
          >
            <div className="relative mb-1">
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
            <div className="max-h-48 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t("noResults")}</p>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(String(option.value));
                      closePopover();
                    }}
                    className={cn(
                      "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-muted",
                      String(value) === String(option.value) && "bg-muted font-medium"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {String(value) === String(option.value) && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
