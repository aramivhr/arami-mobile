import { describe, expect, it } from "vitest";
import { inspectionReportHtml } from "@/lib/inspectionReport";
import { KEYS_ITEMS, KEYS_ROOM, withKeysSection } from "@/lib/inspectionDraft";
import type { Inspection, InspectionResult, ItemCondition } from "@/lib/types";
import { cases } from "./rand";

const NASTY = ["<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "Tom & Jerry", "O'Brien", "Привет", "🙂 towel", "a\nb", ""];
const ROOMS = [
  { room: "Kitchen", items: ["Fridge", "Microwave"] },
  { room: "Bathroom", items: ["Towels", "Toilet"] },
  { room: "Entrance", items: ["Door", "Keys / access cards"] },
];
// What the checklist and the PDF show: keys and access cards as their own section.
const CHECKLIST = withKeysSection(ROOMS);

describe("inspection PDF shows guest text safely and counts items right", () => {
  const reportCases = cases(500, 51, (r) => {
    const results: InspectionResult[] = [];
    for (const { room, items } of CHECKLIST)
      for (const item of items)
        if (r.bool(0.7))
          results.push({
            room,
            item,
            condition: r.pick((room === KEYS_ROOM ? ["ok", "ok", "damaged", "missing"] : ["ok", "ok", "dirty", "damaged", "missing"]) as ItemCondition[]),
            note: r.pick(NASTY) + r.str(4),
            photos: r.bool(0.3) ? [`i1/${r.int(1, 99)}.jpg`] : [],
            ...(room === KEYS_ROOM && r.bool(0.7) ? { count: r.int(0, 3) } : {}),
          });
    return {
      results,
      guest: r.pick(NASTY) + r.str(3),
      unit: r.pick(NASTY),
      summary: r.bool(0.6) ? r.pick(NASTY) + r.str(20) : null,
      notes: r.bool(0.4) ? r.pick(NASTY) : null,
      damage: r.bool(),
      signAll: r.bool(),
      hasTemplate: r.bool(0.8),
    };
  });
  it.each(reportCases)("%s", (_l, c) => {
    const insp = {
      id: "i1", reservation_id: null, apartment_id: "a1", template_id: "t", due_date: "2026-10-04", urgent: false, status: "completed",
      inspector_id: null, guest_name: c.guest, check_in: "2026-10-01", check_out: "2026-10-04", results: c.results, general_notes: c.notes,
      summary: c.summary, damage_found: c.damage, started_at: null, completed_at: "2026-10-04T10:00:00Z", created_at: "", updated_at: "",
    } as Inspection;
    const photoUrls: Record<string, string> = {};
    for (const r of c.results) for (const p of r.photos) if (c.signAll) photoUrls[p] = `https://signed/${p}?t="1"&x=<y>`;
    const html = inspectionReportHtml({ insp, unit: c.unit, template: c.hasTemplate ? { id: "t", name: "x", is_default: true, rooms: ROOMS } : null, photoUrls });

    // No guest- or staff-typed text can inject markup.
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=alert(1)>");
    expect(html).not.toMatch(/src="[^"]*"[^ />]/);
    const issues = c.results.filter((r) => r.condition !== "ok");
    expect(html).toContain(`Items needing attention (${issues.length})`);
    expect((html.match(/class="issue"/g) ?? []).length).toBe(issues.length);
    const expectedImgs = c.signAll ? issues.reduce((n, r) => n + r.photos.length, 0) : 0;
    expect((html.match(/<img /g) ?? []).length).toBe(expectedImgs);
    if (c.hasTemplate) {
      const unchecked = CHECKLIST.reduce((n, { room, items }) => n + items.filter((i) => !c.results.some((r) => r.room === room && r.item === i)).length, 0);
      expect((html.match(/Not checked/g) ?? []).length).toBe(unchecked);
    }
    if (c.hasTemplate) {
      // Keys come first, once, with every key item; the old Entrance line is gone.
      expect(html.indexOf(`<h3>${KEYS_ROOM}</h3>`)).toBeLessThan(html.indexOf("<h3>Kitchen</h3>"));
      expect(html.split(`<h3>${KEYS_ROOM}</h3>`).length).toBe(2);
      for (const k of KEYS_ITEMS) expect(html).toContain(`<td>${k}</td>`);
      expect(html).not.toContain("Keys / access cards");
      for (const r of c.results.filter((x) => x.room === KEYS_ROOM && x.count != null && !(x.condition === "ok" && x.count === 0)))
        expect(html).toContain(`(${r.count} handed back)`);
    }
    expect(html.includes("Damage or missing items found")).toBe(c.damage);
    expect(html.includes("<h2>Report</h2>")).toBe(!!c.summary);
  });
});
