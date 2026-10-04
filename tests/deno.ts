// Loads one of the website's Deno edge functions (copied into tests/web) and
// returns its request handler, with Deno.serve and Deno.env faked.
import { FakeSupabase } from "./fakeSupabase";

export async function loadFunction(file: "mobile-push-dispatch" | "mobile-inspection-complete") {
  let handler: ((req: Request) => Promise<Response>) | null = null;
  (globalThis as any).Deno = { serve: (h: any) => void (handler = h), env: { get: () => "x" } };
  if (file === "mobile-push-dispatch") await import("./web/mobile-push-dispatch");
  else await import("./web/mobile-inspection-complete");
  if (!handler) throw new Error(`${file} did not call Deno.serve`);
  return handler as (req: Request) => Promise<Response>;
}

export function useFake(db: FakeSupabase, user: { id: string } | null = null) {
  (globalThis as any).__fakeAdmin = db;
  (globalThis as any).__fakeUser = user;
}

export const post = (body: unknown) =>
  new Request("http://x/fn", { method: "POST", headers: { Authorization: "Bearer t" }, body: JSON.stringify(body) });
