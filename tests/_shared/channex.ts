// Stand-in for the website's supabase/functions/_shared/channex.ts.
export const corsHeaders = {};
export const channexFetch = (...args: unknown[]) => (globalThis as any).__channexFetch(...args);
