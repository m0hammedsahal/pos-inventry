/** Downloads rows as a CSV file (Excel-friendly, UTF-8 with BOM). */
export function downloadCsv(rows: Record<string, string | number>[], filename: string): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const body = rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  const blob = new Blob(["\ufeff" + [headers.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
