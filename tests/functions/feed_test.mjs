// The phone-calendar feed: real rows from the scratch database → iCalendar.
import { psql, makeSql } from "./shims.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const HERE = new URL(".", import.meta.url).pathname;
const src = readFileSync(HERE + "../../supabase/functions/calendar-feed/index.ts", "utf8").replace(/^import postgres.*$/m, "const postgres: any = null;");
writeFileSync(HERE + ".feed.ts", src);
const feed = await import(HERE + ".feed.ts");
const results = [];
const check = (ok, what, extra = "") => { results.push(ok); console.log(`${ok ? "  ✓" : "  ✗"} ${what}${ok || !extra ? "" : " → " + extra}`); };

const id = crypto.randomUUID();
psql(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('${id}', 'teach@example.com', '{"full_name": "Teacher Two"}', now());
      update public.profiles set status = 'active', role = 'faculty' where id = '${id}';
      update public.courses set faculty_id = '${id}', sched_start = public.local_today() - 7, sched_weeks = 4,
        sched_days = array[to_char(public.local_today() + 2, 'Dy')], sched_time = '19:00',
        location = 'Fellowship Hall, Main Building', meeting_url = 'https://zoom.us/j/555' where id = 'c2';
      insert into public.class_cancellations (course_id, class_date, reason) values ('c2', public.local_today() + 2, 'Snow; roads closed');
      insert into public.calendar_feeds (user_id, token) values ('${id}', repeat('ab', 24));`);
const res = await feed.handler(new Request("https://x/functions/v1/calendar-feed?t=" + "ab".repeat(24)), makeSql());
const ics = await res.text();
writeFileSync(HERE + ".feed.ics", ics);
const events = ics.split("BEGIN:VEVENT").slice(1);
const canceled = events.map((e) => e.replace(/\r\n /g, "")).filter((e) => e.includes("STATUS:CANCELLED"));
check(res.status === 200 && /text\/calendar/.test(res.headers.get("content-type")), "the feed is served as a calendar");
check(canceled.length === 1 && canceled[0].includes("SUMMARY:Canceled: ") && canceled[0].includes("roads closed"), "a canceled class shows as canceled, with the reason", canceled[0]);
check(canceled[0] && /UID:class-c2-/.test(canceled[0]), "…keeping the class's own ID, so phones update it in place");
const normal = events.find((e) => e.includes("STATUS:CONFIRMED"));
check(normal && normal.includes("LOCATION:Fellowship Hall\\, Main Building") && normal.includes("URL:https://zoom.us/j/555") && normal.replace(/\r\n /g, "").includes("Join online: https://zoom.us/j/555"), "classes carry the room and the online link", normal);
check(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "every line is within the calendar format's length limit");
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} feed checks passed`);
process.exit(passed === results.length ? 0 : 1);
