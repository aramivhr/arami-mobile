// A small in-memory stand-in for the Supabase client: enough of the query
// builder, storage and functions for the app's hooks and the website's
// mobile-* functions to run against it.

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

export interface FakeOptions {
  /** Unique keys per table, used by upsert's onConflict and plain inserts. */
  unique?: Record<string, string[][]>;
  /** Adds joined data such as apartments(name, buildings(name)). */
  join?: (table: string, row: Row, select: string) => Row;
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  calls: { table: string; op: string; payload?: unknown; filters: string[] }[] = [];
  storageObjects = new Map<string, Uint8Array | ArrayBuffer>();
  functionCalls: { name: string; body: any }[] = [];
  functionHandler: (name: string, body: any) => Promise<any> = async () => ({});
  /** When set, every request fails with this message (no connection). */
  offline: string | null = null;
  failNext: Record<string, number> = {};
  private seq = 0;

  constructor(private opts: FakeOptions = {}) {}

  table(name: string) {
    return (this.tables[name] ??= []);
  }

  private check(kind: string) {
    if (this.offline) throw new Error(this.offline);
    if (this.failNext[kind]) {
      this.failNext[kind]--;
      throw new Error(`${kind} failed`);
    }
  }

  from(table: string) {
    return new Query(this, table, this.opts);
  }

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: ArrayBuffer, _o?: unknown) => {
        try {
          this.check("upload");
        } catch (e) {
          return { data: null, error: { message: (e as Error).message } };
        }
        const key = `${bucket}/${path}`;
        if (this.storageObjects.has(key)) return { data: null, error: { message: "The resource already exists" } };
        this.storageObjects.set(key, body);
        return { data: { path }, error: null };
      },
      createSignedUrls: async (paths: string[], _ttl: number) => ({
        data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${bucket}/${p}`, error: null })),
        error: null,
      }),
    }),
  };

  /** Database functions callable with rpc(); a missing one fails as it does before Lovable adds it. */
  rpcHandlers: Record<string, (args: any) => any> = {};
  rpcCalls: { name: string; args: any }[] = [];

  async rpc(name: string, args: any = {}) {
    try {
      this.check("rpc");
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
    this.rpcCalls.push({ name, args });
    const fn = this.rpcHandlers[name];
    if (!fn) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } };
    return { data: await fn(args), error: null };
  }

  functions = {
    invoke: async (name: string, { body }: { body: any }) => {
      try {
        this.check("function");
      } catch (e) {
        return { data: null, error: e };
      }
      this.functionCalls.push({ name, body });
      try {
        return { data: await this.functionHandler(name, body), error: null };
      } catch (e) {
        return { data: null, error: e };
      }
    },
  };

  auth = {
    getUser: async (_t: string) => ({ data: { user: (globalThis as any).__fakeUser ?? null } }),
  };

  nextId() {
    return `id-${++this.seq}`;
  }

  /** Internal: run a finished query. */
  exec(q: Query): { data: any; error: any; count?: number } {
    try {
      this.check(q.op);
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
    this.calls.push({ table: q.table, op: q.op, payload: q.payload, filters: q.filterText });
    const rows = this.table(q.table);
    const match = (r: Row) => q.filters.every((f) => f(r));
    const unique = this.opts.unique?.[q.table] ?? [];

    if (q.op === "select") {
      let out = rows.filter(match);
      if (q.head) return { data: null, error: null, count: out.length };
      const total = out.length;
      for (const [col, asc] of q.orders) {
        out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] ?? "") < (b[col] ?? "") ? (asc ? -1 : 1) : asc ? 1 : -1));
      }
      if (q.limitN != null) out = out.slice(0, q.limitN);
      out = out.map((r) => this.project(q, r));
      return this.shape(q, out, q.countExact ? total : undefined);
    }
    if (q.op === "update") {
      const hit = rows.filter(match);
      for (const r of hit) Object.assign(r, q.payload);
      return this.shape(q, hit.map((r) => this.project(q, r)), hit.length);
    }
    if (q.op === "delete") {
      const keep = rows.filter((r) => !match(r));
      const n = rows.length - keep.length;
      this.tables[q.table] = keep;
      return { data: null, error: null, count: n };
    }
    // insert / upsert
    const incoming = (Array.isArray(q.payload) ? q.payload : [q.payload]) as Row[];
    const conflictCols = q.onConflict ? [q.onConflict.split(",").map((s) => s.trim())] : unique;
    const inserted: Row[] = [];
    for (const raw of incoming) {
      const row = { ...raw };
      const clash = rows.find((r) =>
        [...conflictCols, ...unique].some((cols) => cols.every((c) => r[c] != null && r[c] === row[c])),
      );
      if (clash) {
        if (q.op === "upsert" && !q.ignoreDuplicates) Object.assign(clash, row);
        else if (q.op === "insert") return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        continue;
      }
      row.id ??= this.nextId();
      row.created_at ??= new Date().toISOString();
      rows.push(row);
      inserted.push(row);
    }
    return this.shape(q, inserted.map((r) => this.project(q, r)));
  }

  private project(q: Query, r: Row) {
    const base = { ...r };
    return this.opts.join ? this.opts.join(q.table, base, q.columns) : base;
  }

  private shape(q: Query, rows: Row[], count?: number) {
    if (q.mode === "single") {
      if (rows.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
      return { data: rows[0], error: null };
    }
    if (q.mode === "maybe") {
      if (rows.length > 1) return { data: null, error: { message: "multiple rows" } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: q.returning || q.op === "select" ? rows : null, error: null, count };
  }
}

export class Query implements PromiseLike<any> {
  op = "select";
  payload: unknown;
  columns = "*";
  filters: Filter[] = [];
  filterText: string[] = [];
  orders: [string, boolean][] = [];
  limitN: number | null = null;
  mode: "single" | "maybe" | null = null;
  onConflict: string | undefined;
  ignoreDuplicates = false;
  returning = false;

  constructor(
    private db: FakeSupabase,
    public table: string,
    _opts: FakeOptions,
  ) {}

  countExact = false;
  head = false;

  select(cols = "*", o: { count?: string; head?: boolean } = {}) {
    if (o.count === "exact") this.countExact = true;
    if (o.head) this.head = true;
    if (this.op === "select") this.columns = cols;
    else this.returning = true;
    return this;
  }
  insert(rows: unknown) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: unknown, o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = rows;
    this.onConflict = o.onConflict;
    this.ignoreDuplicates = !!o.ignoreDuplicates;
    return this;
  }
  update(v: unknown, _o?: unknown) {
    this.op = "update";
    this.payload = v;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private add(text: string, f: Filter) {
    this.filterText.push(text);
    this.filters.push(f);
    return this;
  }
  eq(c: string, v: unknown) {
    return this.add(`${c}=eq.${v}`, (r) => r[c] === v);
  }
  neq(c: string, v: unknown) {
    return this.add(`${c}=neq.${v}`, (r) => r[c] !== v);
  }
  gte(c: string, v: any) {
    return this.add(`${c}=gte.${v}`, (r) => r[c] != null && r[c] >= v);
  }
  lte(c: string, v: any) {
    return this.add(`${c}=lte.${v}`, (r) => r[c] != null && r[c] <= v);
  }
  lt(c: string, v: any) {
    return this.add(`${c}=lt.${v}`, (r) => r[c] != null && r[c] < v);
  }
  in(c: string, vs: unknown[]) {
    return this.add(`${c}=in.(${vs.join(",")})`, (r) => vs.includes(r[c]));
  }
  not(c: string, op: string, v: unknown) {
    if (op === "is" && v === null) return this.add(`${c}=not.is.null`, (r) => r[c] != null);
    throw new Error(`fake: unsupported not(${op})`);
  }
  /** Supports the "a.in.(x,y),b.in.(z)" form. */
  or(expr: string) {
    const parts = [...expr.matchAll(/(\w+)\.in\.\(([^)]*)\)/g)].map((m) => [m[1], m[2].split(",")] as const);
    if (!parts.length) throw new Error(`fake: unsupported or(${expr})`);
    return this.add(`or=(${expr})`, (r) => parts.some(([c, vs]) => vs.includes(String(r[c]))));
  }
  order(c: string, o: { ascending?: boolean } = {}) {
    this.orders.push([c, o.ascending !== false]);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.db.exec(this))
      .then(ok, bad);
  }
}
