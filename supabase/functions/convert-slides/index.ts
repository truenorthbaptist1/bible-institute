// ============================================================================
// convert-slides — Supabase Edge Function (Oct 10, 2026)
//
// Turns a PowerPoint file, or a Google Slides presentation, into a PDF so the
// site can make one picture per slide. Google does the converting: the file
// is uploaded to the church's Google Drive as a Google Slides presentation,
// exported as PDF, and the temporary copy is deleted straight away.
//
//   POST …/functions/v1/convert-slides?course=<id>&name=<file name>
//        body: the .pptx / .ppt file           → the PDF
//   POST …/functions/v1/convert-slides
//        body: {"course": "<id>", "link": "https://docs.google.com/presentation/d/…"}
//                                              → the PDF
//
// Only faculty can use it (checked with the caller's own sign-in).
// Secrets (Supabase → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — the "TNBBI Website" OAuth client
//   GOOGLE_REFRESH_TOKEN — the church Google account's permission for Drive
//                          (scope drive.file: only files this function makes)
// Verify JWT: ON.
// ============================================================================

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const MAX_BYTES = 100 * 1024 * 1024;

function fail(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { ...CORS, "content-type": "application/json" } });
}

// Is the caller an active faculty member? Asked of the database as the caller.
async function callerIsFaculty(req: Request): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const auth = req.headers.get("authorization") || "";
  if (!url || !anon || !auth.startsWith("Bearer ")) return false;
  const r = await fetch(`${url}/rest/v1/rpc/is_faculty`, {
    method: "POST",
    headers: { apikey: anon, authorization: auth, "content-type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

async function googleToken(): Promise<string> {
  const id = Deno.env.get("GOOGLE_CLIENT_ID"), secret = Deno.env.get("GOOGLE_CLIENT_SECRET"), refresh = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!id || !secret || !refresh) throw new Error("Slide conversion isn't set up yet (Google Drive permission is missing).");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    // Google's reason (e.g. invalid_grant = the permission was withdrawn or expired;
    // invalid_client = the client ID/secret don't match) — no secrets in it.
    const why = [j.error, j.error_description].filter(Boolean).join(": ");
    console.error("google token refresh failed:", r.status, why);
    throw new Error(`Google didn't accept the site's Drive permission — it may need to be renewed.${why ? ` (Google said: ${why})` : ""}`);
  }
  return j.access_token;
}

// A Google Slides presentation → PDF bytes. (The export link has no 10 MB
// limit, unlike the API's export call.)
// The site's permission covers only files it made itself (drive.file — no
// Google review needed), so a teacher's own Google Slides link is opened as
// a shared link ("Anyone with the link can view") if the first try fails.
async function exportPdf(token: string, fileId: string): Promise<Uint8Array> {
  let r = await fetch(`https://docs.google.com/presentation/d/${fileId}/export/pdf`, { headers: { authorization: `Bearer ${token}` }, redirect: "follow" });
  if (!r.ok || !(r.headers.get("content-type") || "").includes("pdf")) {
    r = await fetch(`https://docs.google.com/presentation/d/${fileId}/export/pdf`, { redirect: "follow" });
  }
  if (!r.ok) {
    if (r.status === 404 || r.status === 403) throw new Error("That presentation couldn't be opened. In Google Slides, set Share → General access to \"Anyone with the link\", then try again.");
    throw new Error(`Google couldn't export the presentation (${r.status}).`);
  }
  const type = r.headers.get("content-type") || "";
  if (!type.includes("pdf")) throw new Error("Google didn't send back a PDF — check the presentation is shared with the church account.");
  return new Uint8Array(await r.arrayBuffer());
}

async function uploadAsSlides(token: string, name: string, type: string, bytes: Uint8Array): Promise<string> {
  const boundary = "tnbbi" + crypto.randomUUID().replace(/-/g, "");
  const meta = JSON.stringify({ name: `TNBBI temp — ${name}`.slice(0, 200), mimeType: "application/vnd.google-apps.presentation" });
  const enc = new TextEncoder();
  const head = enc.encode(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${type}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error("Google couldn't read that PowerPoint file. Try saving it again in PowerPoint, or save it as a PDF.");
  return j.id;
}

async function deleteFile(token: string, id: string) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // GET …?health — is the Google permission still good? (Says only yes/no and Google's reason.)
  if (req.method === "GET") {
    try { await googleToken(); return new Response(JSON.stringify({ google: "ok" }), { headers: { ...CORS, "content-type": "application/json" } }); }
    catch (e) { return fail(503, (e as Error).message); }
  }
  if (req.method !== "POST") return fail(405, "Use POST.");
  try {
    if (!(await callerIsFaculty(req))) return fail(403, "Only faculty can add slides.");
    const token = await googleToken();
    const type = req.headers.get("content-type") || "";
    let pdf: Uint8Array;
    if (type.includes("application/json")) {
      const { link } = await req.json();
      const m = /docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]{20,})/.exec(String(link || ""));
      if (!m) return fail(400, "That isn't a Google Slides link.");
      pdf = await exportPdf(token, m[1]);
    } else {
      const name = new URL(req.url).searchParams.get("name") || "slides.pptx";
      if (!/\.(pptx?|odp)$/i.test(name)) return fail(400, "Send a PowerPoint file (.pptx or .ppt).");
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length) return fail(400, "The file was empty.");
      if (bytes.length > MAX_BYTES) return fail(413, "That presentation is too large to convert (over 100 MB). Try saving it as a PDF.");
      const id = await uploadAsSlides(token, name, type || "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes);
      try { pdf = await exportPdf(token, id); }
      finally { await deleteFile(token, id); }
    }
    return new Response(pdf, { headers: { ...CORS, "content-type": "application/pdf" } });
  } catch (e) {
    return fail(500, (e as Error).message || "The presentation couldn't be converted.");
  }
});
