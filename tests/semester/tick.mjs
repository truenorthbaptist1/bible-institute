// One run of the every-minute background service (attendance-reminders),
// at a simulated moment. Usage: node tick.mjs <ISO time> [<ISO time> ...]
// Uses the real function code (as tests/functions does), the scratch
// database "t", the fake Gmail server, a fake push service and a fake
// YouTube whose playlist is read from $SIM/youtube.json.
// Prints one JSON line per run.
import { psql, makeSql, setEnv, nodeTlsWire } from "../functions/shims.mjs";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
const HERE = new URL(".", import.meta.url).pathname;
const SIM = process.env.SIM || "/tmp/sim";
const src = readFileSync(HERE + "../../supabase/functions/attendance-reminders/index.ts", "utf8")
  .replace(/^import postgres.*$/m, "const postgres: any = null;");
writeFileSync(HERE + ".svc.ts", src);
const svc = await import(HERE + ".svc.ts");
svc.setMailConnector(() => nodeTlsWire(Number(process.env.SMTP_PORT || 2465)));
setEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
setEnv("YOUTUBE_API_KEY", "sim-key");
setEnv("YOUTUBE_API_BASE", "https://yt.test/youtube/v3");
const sql = makeSql();
const yt = () => (existsSync(SIM + "/youtube.json") ? JSON.parse(readFileSync(SIM + "/youtube.json", "utf8")) : { playlists: {} });
const fakeFetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.host === "yt.test") {
    if (existsSync(SIM + "/yt_quota")) return new Response(JSON.stringify({ error: { message: "The request cannot be completed because you have exceeded your quota.", errors: [{ reason: "quotaExceeded" }] } }), { status: 403 });
    const db = yt();
    if (u.pathname.endsWith("/playlistItems")) {
      const pl = db.playlists[u.searchParams.get("playlistId")];
      if (!pl) return new Response(JSON.stringify({ error: { message: "not found", errors: [{ reason: "playlistNotFound" }] } }), { status: 404 });
      return new Response(JSON.stringify({ items: pl.map((v, i) => ({ snippet: { position: i, title: v.title }, contentDetails: { videoId: v.id } })) }));
    }
    if (u.pathname.endsWith("/videos")) {
      const ids = u.searchParams.get("id").split(",");
      const all = Object.values(db.playlists).flat();
      return new Response(JSON.stringify({ items: all.filter((v) => ids.includes(v.id)).map((v) => ({
        id: v.id, snippet: { title: v.title, publishedAt: v.published, liveBroadcastContent: v.live || "none" },
        contentDetails: { duration: v.duration }, status: { privacyStatus: "unlisted", embeddable: true },
        liveStreamingDetails: v.streamStart ? { actualStartTime: v.streamStart } : undefined,
        recordingDetails: v.recorded ? { recordingDate: v.recorded } : {} })) }));
    }
  }
  if (u.host === "push.test") {
    appendFileSync(SIM + "/push.log", JSON.stringify({ at: process.argv[2], url: String(url) }) + "\n");
    return new Response(null, { status: 201 });
  }
  throw new Error("unexpected fetch " + url);
};
// Round-2 switches: $SIM/gmail_off → Gmail rejects the password; $SIM/yt_quota → YouTube's daily limit is used up.
if (existsSync(SIM + "/gmail_off")) setEnv("GMAIL_APP_PASSWORD", "wrong password");
for (const iso of process.argv.slice(2)) {
  const out = await svc.runReminders(sql, fakeFetch, new Date(iso));
  console.log(JSON.stringify({ at: iso, ...out }));
}
process.exit(0);
