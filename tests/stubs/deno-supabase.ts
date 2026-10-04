// Stand-in for "npm:@supabase/supabase-js@2" inside the website's Deno functions.
export const createClient = () => (globalThis as any).__fakeAdmin;
