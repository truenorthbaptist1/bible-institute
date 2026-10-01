// Test-only stand-in for @supabase/supabase-js. It implements just the
// parts the site uses and forwards every database call to a local test
// server, which runs it in real Postgres AS THE SIGNED-IN USER — so the
// same privacy rules (Row Level Security) apply as on Supabase.
(function () {
  const API = "/api";
  const KEY = "fake-supabase-session";

  async function post(path, body) {
    const res = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  }
  function loadSession() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function saveSession(s) { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); }

  function createClient() {
    let session = loadSession();
    const listeners = [];
    const emit = (event) => listeners.forEach((cb) => cb(event, session));
    const uid = () => (session ? session.user.id : null);

    class Query {
      constructor(table) { this.q = { table, op: "select", columns: "*", filters: [], order: [], range: null, limit: null, single: null }; }
      select(cols) { if (this.q.op === "select") this.q.columns = cols || "*"; else this.q.returning = true; return this; }
      insert(rows) { this.q.op = "insert"; this.q.rows = Array.isArray(rows) ? rows : [rows]; return this; }
      upsert(rows, opts) { this.q.op = "upsert"; this.q.rows = Array.isArray(rows) ? rows : [rows]; this.q.onConflict = (opts && opts.onConflict) || "id"; return this; }
      update(patch) { this.q.op = "update"; this.q.patch = patch; return this; }
      delete() { this.q.op = "delete"; return this; }
      eq(c, v) { this.q.filters.push([c, "eq", v]); return this; }
      in(c, v) { this.q.filters.push([c, "in", v]); return this; }
      order(c, o) { this.q.order.push([c, !o || o.ascending !== false]); return this; }
      range(a, b) { this.q.range = [a, b]; return this; }
      limit(n) { this.q.limit = n; return this; }
      single() { this.q.single = "single"; return this; }
      maybeSingle() { this.q.single = "maybe"; return this; }
      then(resolve, reject) { return post("/db", { uid: uid(), ...this.q }).then(resolve, reject); }
    }

    const auth = {
      onAuthStateChange(cb) {
        listeners.push(cb);
        setTimeout(() => cb("INITIAL_SESSION", session), 10);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async getSession() { return { data: { session } }; },
      async signInWithPassword({ email, password }) {
        const r = await post("/auth/signin", { email, password });
        if (r.error) return { data: {}, error: r.error };
        session = { user: r.user }; saveSession(session); setTimeout(() => emit("SIGNED_IN"), 0);
        return { data: { session }, error: null };
      },
      async signUp({ email, password, options }) {
        const r = await post("/auth/signup", { email, password, name: options && options.data && options.data.full_name });
        if (r.error) return { data: {}, error: r.error };
        if (window.FAKE_REQUIRE_CONFIRM) return { data: { user: r.user, session: null }, error: null };
        session = { user: r.user }; saveSession(session); setTimeout(() => emit("SIGNED_IN"), 0);
        return { data: { user: r.user, session }, error: null };
      },
      async signInWithOAuth() {
        const email = window.FAKE_GOOGLE_EMAIL || localStorage.getItem("fake-google-email");
        const r = await post("/auth/google", { email });
        if (r.error) return { error: r.error };
        session = { user: r.user }; saveSession(session); setTimeout(() => emit("SIGNED_IN"), 0);
        return { data: {}, error: null };
      },
      async signOut() { session = null; saveSession(null); setTimeout(() => emit("SIGNED_OUT"), 0); return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: {}, error: null }; },
      async resend() { return { data: {}, error: null }; },
    };

    const storage = {
      from(bucket) {
        return {
          upload: (path, file) => post("/storage/upload", { uid: uid(), bucket, path, size: file.size, type: file.type }),
          remove: (paths) => post("/storage/remove", { uid: uid(), bucket, paths }),
          list: (prefix) => post("/storage/list", { uid: uid(), bucket, prefix }),
          createSignedUrls: (paths) => post("/storage/signmany", { uid: uid(), bucket, paths }),
          createSignedUrl: (path, exp, opts) => post("/storage/sign", { uid: uid(), bucket, path, download: opts && opts.download }),
        };
      },
    };

    return {
      auth,
      storage,
      from: (t) => new Query(t),
      rpc: (fn, args) => ({ then: (res, rej) => post("/rpc", { uid: uid(), fn, args: args || {} }).then(res, rej) }),
    };
  }

  window.supabase = { createClient };
})();
