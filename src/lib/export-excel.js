"use client";

// exceljs is dynamically imported by callers on click — it's a real
// spreadsheet engine, not a small dependency, so there's no reason to pull
// it into the initial page bundle for a button most sessions never click.

function triggerDownload(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
const CURRENCY_FORMAT = "#,##0.00";

/**
 * Party ledger -> .xlsx, matching what's on screen (party-ledger-view.jsx):
 * an organization/party letterhead followed by the Description/Dr/Cr/Balance/
 * Type table. Kept ledger-shaped rather than a generic "rows to excel"
 * helper — generalize it once a second table actually needs export, not
 * before.
 */
export async function exportPartyLedgerToExcel({ organizationName, party, entries, filename, labels }) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = organizationName || "Suva ERP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(labels.sheetName);
  sheet.columns = [{ width: 36 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 8 }];

  if (organizationName) {
    const orgRow = sheet.addRow([organizationName]);
    orgRow.getCell(1).font = { bold: true, size: 14 };
  }
  const titleRow = sheet.addRow([`${labels.statementTitle} — ${party.name}`]);
  titleRow.getCell(1).font = { bold: true, size: 11, color: { argb: "FF555555" } };
  sheet.addRow([]);

  const headerRow = sheet.addRow([labels.description, labels.dr, labels.cr, labels.balance, ""]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });

  for (const entry of entries) {
    const row = sheet.addRow([
      `${labels.entryLabel(entry)}${entry.date ? ` (${labels.formatDate(entry.date)})` : ""}`,
      entry.debit || null,
      entry.credit || null,
      Math.abs(entry.runningBalance),
      entry.runningBalance < 0 ? labels.cr : labels.dr,
    ]);
    row.getCell(2).numFmt = CURRENCY_FORMAT;
    row.getCell(3).numFmt = CURRENCY_FORMAT;
    row.getCell(4).numFmt = CURRENCY_FORMAT;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}

/**
 * Inventory tree -> .xlsx, one flat row per (item, variant, warehouse) leaf
 * — mirrors what's on screen (inventory-view.jsx) flattened out of its
 * collapsible tree, and also mirrors legacy's own admin/inventory.php shape
 * (one row per item/variant/warehouse, see items/inventory/actions.js's
 * header comment). `rows` is already flattened + filtered by the caller
 * (respects whatever search/category/warehouse filter is currently applied
 * on screen — export matches what's visible, not the full unfiltered set).
 */
export async function exportInventoryToExcel({ organizationName, rows, filename, labels }) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = organizationName || "Suva ERP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(labels.sheetName);
  sheet.columns = [{ width: 28 }, { width: 18 }, { width: 20 }, { width: 20 }, { width: 14 }, { width: 10 }];

  if (organizationName) {
    const orgRow = sheet.addRow([organizationName]);
    orgRow.getCell(1).font = { bold: true, size: 14 };
  }
  const titleRow = sheet.addRow([labels.title]);
  titleRow.getCell(1).font = { bold: true, size: 11, color: { argb: "FF555555" } };
  sheet.addRow([]);

  const headerRow = sheet.addRow([labels.item, labels.category, labels.variant, labels.warehouse, labels.quantity, labels.unit]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });

  for (const row of rows) {
    sheet.addRow([row.itemName, row.categoryName || "", row.variantName || "", row.warehouseName, row.quantity, row.unitCode]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}
