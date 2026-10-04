// ============================================================================
// calendar-feed — Supabase Edge Function
//
// A private calendar link for each person, which their phone's calendar app
// (iPhone/iPad/Mac Calendar, Google Calendar on Android, Outlook…) adds as a
// "subscribed calendar" and checks for changes on its own. Students get their
// enrolled courses; teachers get the courses they teach:
//   • every class day (at the class time, in Alaska time), minus any day the
//     teacher marked "no class"
//   • every assignment due date (an all-day item; ✓ once you've turned it in)
//
//   GET …/functions/v1/calendar-feed?t=<the person's link code>
//
// The link code is made on the site (Calendar → Add to My Phone's Calendar)
// and can be replaced there any time, which stops the old link working.
// Uses only the database connection Supabase gives every function
// (SUPABASE_DB_URL). Deploy with "Verify JWT" turned OFF — calendar apps
// can't sign in, the long random code is what protects the link.
// ============================================================================
import postgres from "npm:postgres@3.4.5";

const SITE = "https://tnbbibleinstitute.com";
const TZ = "America/Anchorage";
// Courses have a start time but no end time; show each class this long.
export const CLASS_MINUTES = 90;

// deno-lint-ignore no-explicit-any
type Sql = any;
export type FeedRow = {
  kind: "class" | "canceled" | "due";
  ref: string;
  course_id: string;
  course_title: string;
  title: string;
  day: unknown;
  class_time: string;
  done: boolean;
  owner_name: string;
  location?: string;
  meeting_url?: string;
  note?: string;
};

function isoDay(d: unknown): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}
function compactDay(ds: string): string {
  return ds.replace(/-/g, "");
}
function nextDay(ds: string): string {
  const d = new Date(ds + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// Alaska wall-clock time on a given day → the UTC moment, e.g. "20261006T030000Z".
// (Handles daylight saving: works out Anchorage's offset for that day.)
export function alaskaToUtc(ds: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10), h, m);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t); // second pass settles the DST edge
  return stamp(new Date(t));
}
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
// iCalendar text: escape \ ; , and newlines; fold lines at 75 bytes.
function esc(s: string): string {
  return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (bytes.encode(cur + ch).length > limit) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}
function prettyTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function buildCalendar(rows: FeedRow[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//True North Baptist Church Bible Institute//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TNBBI Classes",
    `X-WR-CALDESC:${esc("Class days and assignment due dates from the True North Baptist Church Bible Institute.")}`,
    `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const dtstamp = stamp(now);
  for (const r of rows) {
    const ds = isoDay(r.day);
    const ev = ["BEGIN:VEVENT", `UID:${r.kind === "canceled" ? "class" : r.kind}-${r.ref}@tnbbibleinstitute.com`, `DTSTAMP:${dtstamp}`];
    if (r.kind === "class" || r.kind === "canceled") {
      const timed = /^\d{1,2}:\d{2}/.test(r.class_time || "");
      if (timed) {
        const hhmm = r.class_time.slice(0, 5).padStart(5, "0");
        const start = alaskaToUtc(ds, hhmm);
        const [h, m] = hhmm.split(":").map(Number);
        const endMin = h * 60 + m + CLASS_MINUTES;
        const end = endMin >= 24 * 60
          ? alaskaToUtc(nextDay(ds), `${String(Math.floor(endMin / 60) - 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`)
          : alaskaToUtc(ds, `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`);
        ev.push(`DTSTART:${start}`, `DTEND:${end}`);
      } else {
        ev.push(`DTSTART;VALUE=DATE:${compactDay(ds)}`, `DTEND;VALUE=DATE:${compactDay(nextDay(ds))}`);
      }
      const canceled = r.kind === "canceled";
      const online = /^https:\/\//.test(r.meeting_url || "") ? r.meeting_url! : "";
      const where = (r.location || "").trim() || (online ? "Online" : "");
      const lines = [
        canceled ? `CANCELED${r.note ? ` — ${r.note}` : ""}` : "Class — True North Baptist Church Bible Institute.",
        timed ? `${canceled ? "Was to start" : "Starts"} ${prettyTime(r.class_time)} (Alaska time).` : "",
        where && !canceled ? `Where: ${where}` : "",
        online && !canceled ? `Join online: ${online}` : "",
        SITE,
      ].filter(Boolean);
      ev.push(
        `SUMMARY:${esc((canceled ? "Canceled: " : "") + r.course_title)}`,
        `DESCRIPTION:${esc(lines.join("\n"))}`,
        ...(where ? [`LOCATION:${esc(where)}`] : []),
        ...(online ? [`URL:${online}`] : []),
        `STATUS:${canceled ? "CANCELLED" : "CONFIRMED"}`,
        `TRANSP:${canceled ? "TRANSPARENT" : "OPAQUE"}`,
        "CATEGORIES:Class",
      );
    } else {
      ev.push(
        `DTSTART;VALUE=DATE:${compactDay(ds)}`,
        `DTEND;VALUE=DATE:${compactDay(nextDay(ds))}`,
        `SUMMARY:${esc(`${r.done ? "✓ " : ""}Due: ${r.title} (${r.course_title})`)}`,
        `DESCRIPTION:${esc(`${r.done ? "Turned in. " : ""}Assignment for ${r.course_title}. Open it at ${SITE}/?assignment=${r.ref}`)}`,
        `URL:${SITE}/?assignment=${r.ref}`,
        "TRANSP:TRANSPARENT",
        "CATEGORIES:Assignment",
      );
    }
    ev.push("END:VEVENT");
    lines.push(...ev);
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export async function handler(req: Request, sql: Sql): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Not found", { status: 404 });
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!/^[0-9a-f]{32,128}$/.test(token)) return new Response("This calendar link isn't valid.", { status: 404 });
  try {
    const rows: FeedRow[] = await sql`select * from public.calendar_feed_events(${token}) order by day, kind, course_title`;
    // An unknown or replaced link gets an empty calendar rather than an error,
    // so calendar apps don't keep retrying loudly.
    return new Response(req.method === "HEAD" ? null : buildCalendar(rows), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="tnbbi.ics"',
        "Cache-Control": "private, max-age=900",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response("The calendar couldn't be loaded right now.", { status: 503 });
  }
}

// Supabase runs this; tests import handler() directly instead.
if (typeof Deno !== "undefined" && Deno.env.get("SUPABASE_DB_URL")) {
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
  Deno.serve((req: Request) => handler(req, sql));
}
