// End-to-end test of the behind-the-scenes service (attendance-reminders):
// notifications to phones and email, the weekly backup email, and the
// test-email button. Runs the real function code under Node against a
// scratch Postgres, a fake push service, and a fake Gmail server.
import { psql, makeSql, setEnv, nodeTlsWire } from "./shims.mjs";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { webcrypto as wc } from "node:crypto";

const HERE = new URL(".", import.meta.url).pathname;
const SMTP_PORT = Number(process.env.SMTP_PORT || 2465);
const MAILDIR = process.env.MAILDIR;
const results = [];
const check = (ok, what, extra = "") => { results.push(ok); console.log(`${ok ? "  ✓" : "  ✗"} ${what}${ok || !extra ? "" : " → " + extra}`); };

// --- load the function under test ------------------------------------------
const src = readFileSync(HERE + "../../supabase/functions/attendance-reminders/index.ts", "utf8").replace(/^import postgres.*$/m, "const postgres: any = null;");
writeFileSync(HERE + ".svc.ts", src);
const svc = await import(HERE + ".svc.ts");
svc.setMailConnector(() => nodeTlsWire(SMTP_PORT));
const sql = makeSql();

// --- people ------------------------------------------------------------------
function mkuser(email, name, extra = "") {
  const id = crypto.randomUUID();
  psql(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('${id}', '${email}', '{"full_name": "${name}"}', now());
        update public.profiles set status = 'active' ${extra} where id = '${id}';`);
  return id;
}
const phil = mkuser("phil@example.com", "Pastor Phil McBroom", ", role = 'faculty'");
const blake = mkuser("blake@example.com", "Blake Amis");
const amber = mkuser("amber@example.com", "Amber Amis", ", notify_email = 'daily'");
const quiet = mkuser("quiet@example.com", "Quiet Student", ", notify_email = 'off'");
const church = mkuser("truenorthbaptist1@gmail.com", "True North Baptist", ", role = 'faculty', super_admin = true");
psql(`update public.courses set faculty_id = '${phil}' where id = 'c1';
      insert into public.enrollments (course_id, student_id) values ('c1', '${blake}'), ('c1', '${amber}'), ('c1', '${quiet}');
      delete from public.notifications;
      -- Today's morning summary and backups are already done, so the first
      -- runs below only deal with new notifications.
      update public.profiles set last_digest_on = public.local_today() where id = '${amber}';
      insert into public.site_backups (kind, data, emailed_at) values ('nightly', '{}'::jsonb, now());`);

// Blake's phone: a real Web Push key pair, so we can decrypt what's sent.
const ua = await wc.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const uaPub = new Uint8Array(await wc.subtle.exportKey("raw", ua.publicKey));
const authSecret = wc.getRandomValues(new Uint8Array(16));
const b64u = (b) => Buffer.from(b).toString("base64url");
psql(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device) values ('${blake}', 'https://push.example.com/blake', '${b64u(uaPub)}', '${b64u(authSecret)}', 'iPhone')`);

async function hkdf(salt, ikm, info, len) {
  const k = await wc.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await wc.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
async function decrypt(body) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const asKey = await wc.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await wc.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
  const te = new TextEncoder();
  const ikm = await hkdf(authSecret, shared, Buffer.concat([te.encode("WebPush: info\0"), uaPub, asPub]), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await wc.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await wc.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct));
  return JSON.parse(new TextDecoder().decode(pt.subarray(0, pt.lastIndexOf(2))));
}
let pushed = [];
const fakeFetch = async (url, opts) => {
  if (String(url).startsWith("https://push.example.com/")) {
    pushed.push({ url: String(url), auth: opts.headers.Authorization, msg: await decrypt(new Uint8Array(opts.body)) });
    return new Response(null, { status: 201 });
  }
  throw new Error("unexpected fetch " + url);
};
function mails() {
  return readdirSync(MAILDIR).filter((f) => f.endsWith(".eml")).sort().map((f) => {
    const raw = readFileSync(MAILDIR + "/" + f, "utf8");
    const subj = (raw.match(/^Subject: (.*)$/m) || [])[1] || "";
    const decodedSubj = subj.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
    const to = (raw.match(/^X-Envelope-To: (.*)$/m) || [])[1] || "";
    const parts = [...raw.matchAll(/Content-Type: (text\/html|text\/plain|application\/gzip)[^\r\n]*\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]+)/g)]
      .map((m) => ({ type: m[1], data: Buffer.from(m[2].replace(/\s+/g, ""), "base64") }));
    return { file: f, raw, subject: decodedSubj, to, parts };
  });
}
const clearMail = () => { rmSync(MAILDIR, { recursive: true, force: true }); mkdirSync(MAILDIR, { recursive: true }); };
const T = (min) => new Date(Date.now() + min * 60000);

// --- 1. Messages from the teacher → phone + email -----------------------------
setEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
clearMail();
psql(`insert into public.messages (course_id, student_id, sender_id, from_role, text) values
  ('c1', '${blake}', '${phil}', 'faculty', 'See me after class.'),
  ('c1', '${amber}', '${phil}', 'faculty', 'Welcome!'),
  ('c1', '${quiet}', '${phil}', 'faculty', 'Hi there.')`);
let out = await svc.runReminders(sql, fakeFetch, new Date());
check(pushed.length === 0 && !out.emails, "nothing goes out in the first minute");
out = await svc.runReminders(sql, fakeFetch, T(3));
check(pushed.length === 1 && pushed[0].msg.title === "New message" && /Pastor Phil McBroom/.test(pushed[0].msg.body), "Blake's phone gets the message notification", JSON.stringify(pushed));
check(pushed[0] && pushed[0].msg.url === "https://tnbbibleinstitute.com/?thread=c1", "…which opens the conversation", pushed[0] && pushed[0].msg.url);
check(/^vapid t=/.test(pushed[0].auth), "…signed with the site's push key");
let m = mails();
check(m.length === 1 && m[0].to.includes("blake@example.com"), "Blake gets one email (Amber chose a daily summary; Quiet chose none)", m.map((x) => x.to).join(" | "));
const html = m[0] && m[0].parts.find((p) => p.type === "text/html").data.toString("utf8");
check(m[0] && m[0].subject === "New message from Pastor Phil McBroom in Hermeneutics I", "…its subject is the notification", m[0] && m[0].subject);
check(html && html.includes("https://tnbbibleinstitute.com/?thread=c1") && html.includes("Hello Blake,"), "…it greets him and links to the conversation");
check(m[0] && /^From: True North Baptist Church Bible Institute <truenorthbaptist1@gmail\.com>/m.test(m[0].raw), "…from the church's Gmail");
if (html) writeFileSync(HERE + ".email-instant.html", html);
const st = JSON.parse(psql(`select json_agg(s) from public.service_status s`));
check(st && st.some((s) => s.key === "email" && s.ok), "Settings shows email as working");

// --- 2. Several at once → one phone note, one email ----------------------------
pushed = []; clearMail();
const qid = psql(`insert into public.assignments (course_id, title, due, points) values ('c1', 'Essay on Romans 8', public.local_today(), 10) returning id`).split("\n")[0];
psql(`insert into public.submissions (assignment_id, student_id, status, score) values ('${qid}', '${blake}', 'graded', 9);
      insert into public.announcements (course_id, author_id, body) values ('c1', '${phil}', 'No class next week — Thanksgiving.');`);
await svc.runReminders(sql, fakeFetch, T(6));
check(pushed.length === 1 && pushed[0].msg.title === "2 new updates", "two things at once arrive as one phone note", JSON.stringify(pushed.map((p) => p.msg)));
m = mails();
check(m.length === 1 && m[0].subject === "2 updates from the Bible Institute", "…and one email", m.map((x) => x.subject).join(" | "));

// --- 3. The daily summary at 7 AM ----------------------------------------------
clearMail();
const sevenAm = new Date(JSON.parse(psql(`select to_json(((public.local_today() + 1) + time '07:02') at time zone 'America/Anchorage')`)));
await svc.runReminders(sql, fakeFetch, sevenAm);
m = mails().filter((x) => x.to.includes("amber"));
check(m.length === 1 && /^Your daily summary from the Bible Institute \(2 updates\)$/.test(m[0].subject), "Amber gets one morning summary with both updates", mails().map((x) => x.to + ":" + x.subject).join(" | "));
const dhtml = m[0] && m[0].parts.find((p) => p.type === "text/html").data.toString("utf8");
if (dhtml) writeFileSync(HERE + ".email-digest.html", dhtml);
check(!mails().some((x) => x.to.includes("quiet")), "Quiet (email off) gets nothing");

// --- 4. No password set → nothing sent, and Settings says why --------------------
setEnv("GMAIL_APP_PASSWORD", undefined); clearMail();
psql(`insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '${blake}', '${phil}', 'faculty', 'Test')`);
await svc.runReminders(sql, fakeFetch, T(20));
const st2 = JSON.parse(psql(`select json_agg(s) from public.service_status s where key = 'email'`));
check(mails().length === 0 && st2[0].ok === false && /GMAIL_APP_PASSWORD/.test(st2[0].detail), "without the Gmail password: no email, and the reason is shown to Admins", JSON.stringify(st2));
setEnv("GMAIL_APP_PASSWORD", "wrong password");
psql(`insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '${blake}', '${phil}', 'faculty', 'Test 2')`);
await svc.runReminders(sql, fakeFetch, T(30));
const st3 = JSON.parse(psql(`select json_agg(s) from public.service_status s where key = 'email'`));
check(st3[0].ok === false && /Username and Password not accepted/.test(st3[0].detail), "a wrong Gmail password is reported clearly", JSON.stringify(st3));
setEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");

// --- 5. Nightly backup + weekly backup email ------------------------------------
// (A Sunday at least a week out, so the backup marked emailed above is old by then.)
clearMail();
const sunday = new Date(JSON.parse(psql(`select to_json(((public.local_today() + 14 - extract(dow from public.local_today())::int) + time '03:30') at time zone 'America/Anchorage')`)));
out = await svc.runReminders(sql, fakeFetch, sunday);
check(out.backup > 0, "the nightly backup is taken", JSON.stringify(out));
m = mails().filter((x) => /Weekly backup/.test(x.subject));
check(m.length === 1 && m[0].to.includes("truenorthbaptist1@gmail.com"), "Sunday morning: the weekly backup is emailed to the church Gmail", mails().map((x) => x.subject).join(" | "));
const gz = m[0] && m[0].parts.find((p) => p.type === "application/gzip");
let backup = null;
try { backup = JSON.parse(gunzipSync(gz.data).toString("utf8")); } catch (e) { /* checked below */ }
check(backup && backup.format === "tnbbi-backup-1" && backup.tables.courses.length > 0 && backup.tables.profiles.some((p) => p.email === "blake@example.com"), "…the attachment is a complete, readable backup");
if (backup) writeFileSync(HERE + ".backup.json", JSON.stringify(backup));
clearMail();
await svc.runReminders(sql, fakeFetch, new Date(sunday.getTime() + 3600000));
check(!mails().some((x) => /Weekly backup/.test(x.subject)), "…only once that week");

// --- 6. The test-email button --------------------------------------------------
clearMail();
setEnv("SUPABASE_URL", "https://fake.supabase.co");
const authFetch = async (url, opts) => {
  if (String(url).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: phil }), { status: 200 });
  return fakeFetch(url, opts);
};
const res = await svc.handler(new Request("https://x/functions/v1/attendance-reminders?testemail=1", { method: "POST", headers: { authorization: "Bearer t", apikey: "k" } }), sql, authFetch);
const body = await res.json();
check(res.status === 200 && body.to === "phil@example.com" && mails().length === 1, "“Send a test email” reaches the person who asked", JSON.stringify(body));

// --- 7. "Can we reach Gmail?" check ------------------------------------------------
const mc = await (await svc.handler(new Request("https://x/functions/v1/attendance-reminders?mailcheck=1", { method: "POST" }), sql, fakeFetch)).json();
check(mc.reachable === true && /^220/.test(mc.greeting) && mc.passwordSet === true, "the mail-server check reports it can reach the server", JSON.stringify(mc));

// --- 8. Lecture videos from a YouTube playlist ----------------------------------
check(svc.isoDuration("PT1H2M3S") === 3723 && svc.isoDuration("PT45M") === 2700 && svc.isoDuration("P0D") === 0, "YouTube video lengths are read correctly");
psql(`insert into public.courses (id, title, faculty_id, sched_mode, sched_start, sched_weeks, sched_days, sched_time, format, playlist_id)
        values ('yt', 'Online Bibliology', '${phil}', 'scheduled', public.local_today() - 7, 8, array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], '19:00', 'online', 'PLgood');
      insert into public.enrollments (course_id, student_id, track) values ('yt', '${blake}', 'recorded');
      delete from public.notifications;`);
let ytVideos = [
  { id: "vidAAAA0001", title: "Lecture 1 — Inspiration", dur: "PT52M10S", rec: null, pub: "2026-09-01T03:00:00Z", live: "none" },
];
const ytCalls = [];
const ytFetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.hostname !== "yt.test") return fakeFetch(url, opts);
  ytCalls.push(u.pathname + "?" + u.searchParams.toString());
  if (u.searchParams.get("key") !== "test-key") return new Response(JSON.stringify({ error: { message: "API key not valid.", errors: [{ reason: "keyInvalid" }] } }), { status: 400 });
  if (u.pathname.endsWith("/playlistItems")) {
    if (u.searchParams.get("playlistId") !== "PLgood") return new Response(JSON.stringify({ error: { message: "not found", errors: [{ reason: "playlistNotFound" }] } }), { status: 404 });
    return new Response(JSON.stringify({ items: ytVideos.map((v, i) => ({ snippet: { title: v.title, position: i }, contentDetails: { videoId: v.id } })) }));
  }
  if (u.pathname.endsWith("/videos")) {
    const ids = u.searchParams.get("id").split(",");
    return new Response(JSON.stringify({ items: ytVideos.filter((v) => ids.includes(v.id) && v.priv !== true).map((v) => ({
      id: v.id, snippet: { title: v.title, publishedAt: v.pub, liveBroadcastContent: v.live },
      contentDetails: { duration: v.dur }, status: { privacyStatus: "unlisted", embeddable: true },
      ...(v.rec ? { recordingDetails: { recordingDate: v.rec } } : {}) })) }));
  }
  return new Response("{}", { status: 404 });
};
setEnv("YOUTUBE_API_BASE", "https://yt.test/youtube/v3");
setEnv("YOUTUBE_API_KEY", undefined);
out = await svc.runReminders(sql, ytFetch, new Date());
let ps = JSON.parse(psql(`select json_agg(s) from public.playlist_sync s where course_id = 'yt'`));
check(ps && ps[0].ok === false && /YOUTUBE_API_KEY/.test(ps[0].error), "without a YouTube key, the course shows a clear message", JSON.stringify(ps));
setEnv("YOUTUBE_API_KEY", "test-key");
psql(`select public.sync_course_lessons('yt', 'PLgood', '[]'::jsonb, 'reset'); update public.playlist_sync set synced_at = now() - interval '1 hour', ok = false where course_id = 'yt'`);
out = await svc.runReminders(sql, ytFetch, new Date());
let ls = JSON.parse(psql(`select json_agg(l order by position) from public.lessons l where course_id = 'yt'`));
check(ls && ls.length === 1 && ls[0].duration_seconds === 3130 && ls[0].status === "ok", "the playlist's video becomes a lecture, with its length", JSON.stringify(ls));
check(psql(`select count(*) from public.notifications where kind = 'lecture'`) === "0", "…quietly, on the first reading");
ytVideos.push({ id: "vidBBBB0002", title: "Lecture 2 — Preservation", dur: "PT1H", rec: "2026-10-01T00:00:00Z", pub: "2026-10-02T03:00:00Z", live: "none" });
psql(`update public.playlist_sync set synced_at = now() - interval '31 minutes' where course_id = 'yt'`);
out = await svc.runReminders(sql, ytFetch, new Date());
ls = JSON.parse(psql(`select json_agg(l order by position) from public.lessons l where course_id = 'yt'`));
check(ls.length === 2 && ls[1].recorded_on === "2026-10-01", "a newly uploaded video is added (with its recording date)", JSON.stringify(ls.map((l) => [l.video_id, l.recorded_on])));
const n = JSON.parse(psql(`select json_agg(n) from public.notifications n where kind = 'lecture'`));
check(n && n.length === 1 && n[0].user_id === blake && /Lecture 2/.test(n[0].subject) && /^\/\?lesson=/.test(n[0].link), "…and the online student is told", JSON.stringify(n));
const calls = ytCalls.length;
out = await svc.runReminders(sql, ytFetch, new Date());
check(ytCalls.length === calls, "the playlist isn't re-read every minute");
psql(`update public.courses set playlist_id = 'PLwrong' where id = 'yt'`);
out = await svc.runReminders(sql, ytFetch, new Date());
ps = JSON.parse(psql(`select json_agg(s) from public.playlist_sync s where course_id = 'yt'`));
check(ps[0].ok === false && /can't find this playlist/.test(ps[0].error), "a wrong or Private playlist is reported clearly", ps[0].error);
setEnv("YOUTUBE_API_BASE", undefined);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} service checks passed`);
process.exit(passed === results.length ? 0 : 1);
