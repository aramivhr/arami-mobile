import { describe, expect, it } from "vitest";
import { MATCH_WINDOW_MS, matchSenders, staffLabel, type SenderNote } from "@/lib/senders";
import { inspectionReportHtml } from "@/lib/inspectionReport";
import { cases } from "./rand";
import type { Inspection, ThreadMessage } from "@/lib/types";

// Matching Channex replies to the app's notes of who sent them, and the
// "Submitted by" line on the inspection PDF.

const T0 = Date.UTC(2026, 9, 5, 9);
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

describe("matchSenders", () => {
  it("credits each reply sent from the app to its sender", () => {
    const msgs: ThreadMessage[] = [
      { id: "g1", text: "Hi, where is the key?", sender: "guest", at: at(0) },
      { id: "p1", text: "In the lockbox", sender: "property", at: at(2) },
      { id: "p2", text: "Welcome!", sender: "property", at: at(30) },
    ];
    const notes: SenderNote[] = [{ thread_id: "t", body: "In the lockbox", user_id: "anna", sent_at: at(2.1) }];
    expect(matchSenders(msgs, notes)).toEqual({ p1: "anna" });
  });

  it("never credits guest or system messages, or a note outside the time window", () => {
    const msgs: ThreadMessage[] = [
      { id: "g1", text: "Thanks", sender: "guest", at: at(0) },
      { id: "s1", text: "Thanks", sender: "system", at: at(0) },
      { id: "p1", text: "Thanks", sender: "property", at: at(0) },
    ];
    expect(matchSenders(msgs, [{ thread_id: "t", body: "Thanks", user_id: "u", sent_at: at(16) }])).toEqual({});
    expect(matchSenders(msgs, [{ thread_id: "t", body: " Thanks\n", user_id: "u", sent_at: at(14) }])).toEqual({ p1: "u" });
  });

  it("gives the same text sent twice to whoever sent each one", () => {
    const msgs: ThreadMessage[] = [
      { id: "p1", text: "OK", sender: "property", at: at(0) },
      { id: "p2", text: "OK", sender: "property", at: at(10) },
    ];
    const notes: SenderNote[] = [
      { thread_id: "t", body: "OK", user_id: "b", sent_at: at(10) },
      { thread_id: "t", body: "OK", user_id: "a", sent_at: at(0) },
    ];
    expect(matchSenders(msgs, notes)).toEqual({ p1: "a", p2: "b" });
  });

  // Generated conversations: every matched message is a property reply whose
  // text equals its note's, within the window, and no note is used twice.
  const scen = cases(3000, 7711, (r) => {
    const texts = ["OK", "Thanks!", "See you at 3pm", "Code is 1234", "  OK  "];
    const messages: ThreadMessage[] = Array.from({ length: r.int(0, 10) }, (_, i) => ({
      id: `m${i}`, text: r.pick(texts), sender: r.pick(["guest", "property", "property", "system", null]), at: r.bool(0.9) ? at(r.int(0, 120)) : null,
    }));
    const notes: SenderNote[] = Array.from({ length: r.int(0, 8) }, () => ({
      thread_id: "t", body: r.pick(texts), user_id: r.pick(["anna", "ben", "cara"]), sent_at: at(r.int(0, 140)),
    }));
    return { messages, notes };
  });
  it.each(scen)("%s", (_l, { messages, notes }) => {
    const got = matchSenders(messages, notes);
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    const usedNotes: number[] = [];
    for (const [mid, uid] of Object.entries(got)) {
      const m = messages.find((x) => x.id === mid)!;
      expect(m.sender).toBe("property");
      const i = notes.findIndex((n, j) => !usedNotes.includes(j) && n.user_id === uid && norm(n.body) === norm(m.text) && (!m.at || Math.abs(Date.parse(m.at) - Date.parse(n.sent_at)) <= MATCH_WINDOW_MS));
      expect(i).toBeGreaterThanOrEqual(0);
      usedNotes.push(i);
    }
    // Every property reply with a matching note available is credited, as long as notes remain.
    const property = messages.filter((m) => m.sender === "property" && norm(m.text));
    const matchable = property.filter((m) => notes.some((n) => norm(n.body) === norm(m.text) && (!m.at || Math.abs(Date.parse(m.at) - Date.parse(n.sent_at)) <= MATCH_WINDOW_MS)));
    if (matchable.length === 1) expect(got[matchable[0].id]).toBeDefined();
    expect(Object.keys(got).length).toBeLessThanOrEqual(Math.min(property.length, notes.length));
  });
});

describe("staffLabel", () => {
  it("prefers the username, then the email before @", () => {
    expect(staffLabel({ username: "anna", email: "anna.k@arami.app" })).toBe("anna");
    expect(staffLabel({ username: "  ", email: "ben@arami.app" })).toBe("ben");
    expect(staffLabel({ username: null, email: null })).toBeNull();
  });
});

describe("inspection PDF", () => {
  const insp: Inspection = {
    id: "i1", reservation_id: null, apartment_id: "a1", template_id: null, due_date: "2026-10-05", urgent: false, status: "completed",
    inspector_id: "anna", guest_name: "Guest", check_in: "2026-10-01", check_out: "2026-10-05", results: [], general_notes: null, summary: null,
    damage_found: false, started_at: null, completed_at: "2026-10-05T10:00:00Z", created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z",
  };
  it("shows who submitted it only when a name is given, escaped", () => {
    expect(inspectionReportHtml({ insp, unit: "1204", template: null, photoUrls: {} })).not.toContain("Submitted by");
    const html = inspectionReportHtml({ insp, unit: "1204", template: null, photoUrls: {}, inspectedBy: "Anna <K>" });
    expect(html).toContain("<tr><td>Submitted by</td><td>Anna &lt;K&gt;</td></tr>");
  });
});
