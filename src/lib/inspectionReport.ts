import { COMPANY_ADDRESS, COMPANY_NAME, COMPANY_PHONE, COMPANY_WEBSITE } from "@/lib/company";
import { dateTime, prettyDate } from "@/lib/dates";
import { KEYS_ROOM, withKeysSection } from "@/lib/inspectionDraft";
import type { Inspection, InspectionResult, InspectionTemplate } from "@/lib/types";

// HTML for the shareable inspection report PDF (printed with expo-print).

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

const CONDITION: Record<string, { label: string; color: string }> = {
  ok: { label: "OK", color: "#059669" },
  dirty: { label: "Dirty", color: "#d97706" },
  damaged: { label: "Damaged", color: "#dc2626" },
  missing: { label: "Missing", color: "#dc2626" },
};

/** "OK" / "Damaged" ..., with keys showing how many were handed back. */
export function conditionText(r: Pick<InspectionResult, "room" | "condition" | "count">) {
  const base = CONDITION[r.condition]?.label ?? r.condition;
  if (r.room !== KEYS_ROOM) return base;
  if (r.condition === "ok" && r.count === 0) return "None for this unit";
  const label = r.condition === "ok" ? "Returned" : base;
  return r.count != null ? `${label} (${r.count} handed back)` : label;
}

export function inspectionReportHtml({
  insp,
  unit,
  template,
  photoUrls,
  inspectedBy = null,
}: {
  insp: Inspection;
  unit: string;
  template: InspectionTemplate | null;
  /** storage path -> viewable link */
  photoUrls: Record<string, string>;
  /** Who submitted it; only given when a super admin makes the PDF. */
  inspectedBy?: string | null;
}) {
  const issues = insp.results.filter((r) => r.condition !== "ok");
  const rooms = template?.rooms?.length
    ? withKeysSection(template.rooms)
    : [...new Set(insp.results.map((r) => r.room))].map((room) => ({ room, items: [] as string[] }));

  const photographed = insp.results.filter((r) => r.condition === "ok" && r.photos.length > 0);
  const row = (r: InspectionResult) => {
    const c = CONDITION[r.condition];
    const photos = r.photos
      .map((p) => photoUrls[p])
      .filter(Boolean)
      .map((u) => `<img src="${esc(u)}" />`)
      .join("");
    return `<div class="issue">
      <div><b>${esc(r.room)} · ${esc(r.item)}</b> <span class="tag" style="color:${c.color};border-color:${c.color}">${esc(conditionText(r))}</span></div>
      ${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}
      ${photos ? `<div class="photos">${photos}</div>` : ""}
    </div>`;
  };
  const issueRows = issues.map(row).join("");
  const otherRows = photographed.map(row).join("");

  const roomTables = rooms
    .map(({ room, items }) => {
      const names = items.length ? items : insp.results.filter((r) => r.room === room).map((r) => r.item);
      const rows = names
        .map((item) => {
          const r = insp.results.find((x) => x.room === room && x.item === item);
          const c = r ? CONDITION[r.condition] : null;
          return `<tr><td>${esc(item)}</td><td style="color:${c?.color ?? "#64748b"}">${r ? esc(conditionText(r)) : "Not checked"}</td><td>${esc(r?.note)}</td></tr>`;
        })
        .join("");
      return `<h3>${esc(room)}</h3><table>${rows}</table>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 12px; margin: 28px; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #f59e0b; padding-bottom: 10px; margin-bottom: 16px; }
  .company { font-size: 10px; color: #64748b; text-align: right; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 14px; margin: 18px 0 8px; } h3 { font-size: 12px; margin: 12px 0 4px; }
  .meta td { padding: 2px 12px 2px 0; } .meta td:first-child { color: #64748b; }
  .summary { white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  .issue { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-bottom: 8px; page-break-inside: avoid; }
  .tag { border: 1px solid; border-radius: 10px; padding: 0 6px; font-size: 10px; margin-left: 6px; }
  .note { color: #334155; margin-top: 4px; }
  .photos img { width: 150px; height: 112px; object-fit: cover; border-radius: 6px; margin: 6px 6px 0 0; }
  table { width: 100%; border-collapse: collapse; } table td { border-bottom: 1px solid #f1f5f9; padding: 4px 6px 4px 0; vertical-align: top; }
</style></head><body>
<div class="head">
  <div><h1>Checkout inspection</h1><div style="color:#64748b">${esc(unit)}</div></div>
  <div class="company"><b>${esc(COMPANY_NAME)}</b><br/>${esc(COMPANY_ADDRESS)}<br/>${esc(COMPANY_PHONE)} · ${esc(COMPANY_WEBSITE)}</div>
</div>
<table class="meta">
  <tr><td>Guest</td><td>${esc(insp.guest_name ?? "—")}</td></tr>
  <tr><td>Stay</td><td>${insp.check_in ? prettyDate(insp.check_in) : "—"} – ${insp.check_out ? prettyDate(insp.check_out) : "—"}</td></tr>
  <tr><td>Completed</td><td>${insp.completed_at ? dateTime(insp.completed_at) : "Not finished"}</td></tr>
${inspectedBy ? `  <tr><td>Submitted by</td><td>${esc(inspectedBy)}</td></tr>\n` : ""}  <tr><td>Result</td><td>${insp.damage_found ? '<b style="color:#dc2626">Damage or missing items found</b>' : issues.length ? "Cleaning needed" : "All OK"}</td></tr>
</table>
${insp.summary ? `<h2>Report</h2><div class="summary">${esc(insp.summary)}</div>` : ""}
${insp.general_notes ? `<h2>Notes</h2><div class="summary">${esc(insp.general_notes)}</div>` : ""}
<h2>Items needing attention (${issues.length})</h2>
${issueRows || "<div>None</div>"}
${otherRows ? `<h2>Other photos</h2>${otherRows}` : ""}
<h2>Full checklist</h2>
${roomTables}
</body></html>`;
}
