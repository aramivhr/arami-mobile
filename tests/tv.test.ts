import { describe, expect, it } from "vitest";
import { inspectionReportHtml } from "@/lib/inspectionReport";
import { isOptionalItem, markRestOk, progress, withKeysSection } from "@/lib/inspectionDraft";
import type { Inspection, InspectionResult } from "@/lib/types";

// Bedrooms have an optional "TV" item: it shows in the checklist, isn't needed to
// finish the room, isn't ticked by "Mark the rest OK", and is in the report only
// once someone checked it.

const ROOMS = [
  { room: "Living room", items: ["Sofa and cushions", "TV and remote"] },
  { room: "Bedroom", items: ["Bed and linen", "Wardrobe and hangers"] },
  { room: "Master bedroom", items: ["Bed and linen", "TV"] },
];

const insp = (results: InspectionResult[]) =>
  ({
    id: "i1", reservation_id: null, apartment_id: "a1", template_id: "t", due_date: "2026-10-04", urgent: false, status: "completed",
    inspector_id: null, guest_name: "Ann", check_in: "2026-10-01", check_out: "2026-10-04", results, general_notes: null,
    summary: null, damage_found: false, started_at: null, completed_at: "2026-10-04T10:00:00Z", created_at: "", updated_at: "",
  }) as Inspection;

describe("Optional bedroom TV", () => {
  const rooms = withKeysSection(ROOMS);
  it("adds TV to every bedroom once, and to no other room", () => {
    expect(rooms.find((r) => r.room === "Bedroom")!.items).toEqual(["Bed and linen", "Wardrobe and hangers", "TV"]);
    expect(rooms.find((r) => r.room === "Master bedroom")!.items).toEqual(["Bed and linen", "TV"]);
    expect(rooms.find((r) => r.room === "Living room")!.items).not.toContain("TV");
    expect(isOptionalItem("Bedroom", "TV")).toBe(true);
    expect(isOptionalItem("Living room", "TV and remote")).toBe(false);
  });
  it("doesn't count towards progress, and Mark the rest OK leaves it", () => {
    const results = markRestOk([], "Bedroom", rooms.find((r) => r.room === "Bedroom")!.items);
    expect(results.map((r) => r.item)).toEqual(["Bed and linen", "Wardrobe and hangers"]);
    const p = progress(rooms, results);
    expect(p.total).toBe(rooms.reduce((n, r) => n + r.items.length, 0) - 2);
  });
  it("is in the report only when checked", () => {
    const tpl = { id: "t", name: "x", is_default: true, rooms: ROOMS };
    const none = inspectionReportHtml({ insp: insp([]), unit: "1204", template: tpl, photoUrls: {} });
    expect(none).not.toContain("<td>TV</td>");
    const tv: InspectionResult = { room: "Bedroom", item: "TV", condition: "damaged", note: "Screen cracked", photos: [] };
    const one = inspectionReportHtml({ insp: insp([tv]), unit: "1204", template: tpl, photoUrls: {} });
    expect(one.match(/<td>TV<\/td>/g)).toHaveLength(1);
    expect(one).toContain("Screen cracked");
  });
});
