// ============================================================================
// Data layer — every read and write to Supabase goes through here.
//
// The screens in app.js work with the same simple shapes the preview used
// (a `courses` array with materials, assignments, submissions, discussion,
// messages, and enrollment requests nested inside each course, plus a
// `users` array). loadAll() fetches whatever the signed-in person is
// ALLOWED to see — the database's privacy rules filter it — and assembles
// those shapes. Every change is written to the database first, then the
// data is reloaded, so what's on screen always matches what's stored.
// ============================================================================

const sb = window.supabase.createClient(TNBBI_CONFIG.supabaseUrl, TNBBI_CONFIG.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

const MATERIAL_MAX_BYTES = 50 * 1024 * 1024;
const SUBMISSION_MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_UPLOAD_EXT = ["pdf", "doc", "docx", "ppt", "pptx", "odt", "rtf", "txt", "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "mp3", "m4a", "mp4"];
const UPLOAD_ACCEPT = ALLOWED_UPLOAD_EXT.map((e) => "." + e).join(",");

let notifications = [];
let bibleHighlightRows = [];
let dataLoadedAt = 0;

// Turn database/network errors into sentences a person can act on.
function friendlyError(err) {
  const msg = (err && (err.message || err.error_description || err.error)) || String(err || "");
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return "Couldn't reach the server — check your internet connection and try again.";
  if (/row-level security|permission denied|not authorized/i.test(msg)) return "You don't have permission to do that.";
  if (/JWT expired|invalid JWT|session/i.test(msg)) return "Your sign-in expired — please sign in again.";
  if (/Payload too large|maximum allowed size|exceeded the maximum/i.test(msg)) return "That file is too large.";
  if (/mime type .* is not supported|invalid mime/i.test(msg)) return "That file type isn't allowed. Try PDF, Word, a text file, or a photo.";
  if (/duplicate key/i.test(msg)) return "That's already been done.";
  return msg || "Something went wrong.";
}

function must(res) {
  if (res.error) throw new Error(friendlyError(res.error));
  return res.data;
}

// Supabase returns at most 1,000 rows per request; page through bigger tables.
async function selectAll(table, columns = "*", order = null) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let q = sb.from(table).select(columns).range(from, from + pageSize - 1);
    if (order) q = q.order(order, { ascending: true });
    const data = must(await q);
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function safeFileName(name) {
  return (name || "file").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}

function checkUpload(file, maxBytes) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_UPLOAD_EXT.includes(ext)) {
    throw new Error(`"${file.name}" isn't an allowed file type. Use PDF, Word, PowerPoint, a text file, a photo, or audio.`);
  }
  if (file.size > maxBytes) {
    throw new Error(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${Math.round(maxBytes / 1048576)} MB.`);
  }
}

// ---------------------------------------------------------------------------
// Profiles & session
// ---------------------------------------------------------------------------
function profileToUser(p) {
  return {
    id: p.id,
    name: p.name || "",
    email: p.email || "",
    role: p.role || "student",
    status: p.status || "active",
    superAdmin: !!p.super_admin,
    createdAt: (p.created_at || "").slice(0, 10),
    emailVerified: !!p.email_verified_at,
    // Profile details. Students only ever receive the public part of a
    // classmate (photo, home church, about me) — phone and address arrive
    // only for their own profile, or for faculty.
    phone: p.phone || "",
    addressLine: p.address_line || "",
    city: p.city || "",
    state: p.state || "",
    postalCode: p.postal_code || "",
    homeChurch: p.home_church || "",
    bio: p.bio || "",
    avatarPath: p.avatar_path || null,
    dueReminders: p.due_reminders || "evening",
  };
}

// ---------------------------------------------------------------------------
// Profile photos live in a private bucket, so each one is shown through a
// short-lived signed link. Links are fetched in one batch and reused until
// they're close to expiring.
// ---------------------------------------------------------------------------
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_LINK_SECONDS = 6 * 60 * 60;
const avatarUrlCache = {}; // path → { url, expires }

async function refreshAvatarUrls(list) {
  const now = Date.now();
  const need = [...new Set(list.map((u) => u.avatarPath).filter(Boolean))]
    .filter((path) => !avatarUrlCache[path] || avatarUrlCache[path].expires - now < 30 * 60 * 1000);
  if (need.length) {
    const { data, error } = await sb.storage.from("avatars").createSignedUrls(need, AVATAR_LINK_SECONDS);
    if (!error && data) {
      data.forEach((d) => {
        if (d && d.signedUrl && !d.error) avatarUrlCache[d.path] = { url: d.signedUrl, expires: now + AVATAR_LINK_SECONDS * 1000 };
      });
    }
  }
  list.forEach((u) => { u.avatarUrl = u.avatarPath && avatarUrlCache[u.avatarPath] ? avatarUrlCache[u.avatarPath].url : null; });
}

async function fetchOwnProfile(uid) {
  // The profile is created by a database trigger the instant the account
  // is; retry briefly in case we got here a hair before it landed.
  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) throw new Error(friendlyError(error));
    if (data) return profileToUser(data);
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Your account was created, but its profile isn't ready yet. Please refresh the page.");
}

// ---------------------------------------------------------------------------
// Load everything this person can see, and assemble the screen shapes.
// ---------------------------------------------------------------------------
async function loadAll() {
  const fac = currentUser.role === "faculty";
  const [cs, enr, reqs, mats, asg, subs, posts, msgs, notifs, hls, people, mine, attDays, attMarks] = await Promise.all([
    selectAll("courses", "*", "title"),
    selectAll("enrollments", "course_id,student_id"),
    selectAll("enrollment_requests", "*", "requested_at"),
    selectAll("materials", "*", "created_at"),
    selectAll("assignments", "*", "due"),
    selectAll("submissions", "*"),
    selectAll("discussion_posts", "*", "created_at"),
    selectAll("messages", "*", "sent_at"),
    sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(60).then(must),
    selectAll("bible_highlights", "*", "created_at"),
    fac ? selectAll("profiles", "*") : sb.rpc("visible_people").then(must),
    // Your own full profile row — always, so a role change made elsewhere
    // (e.g. faculty promoted or demoted you) is noticed on this load.
    sb.from("profiles").select("*").eq("id", currentUser.id).maybeSingle().then(must),
    // Attendance: the database returns only what this person may see — a
    // teacher's own courses, or a student's own marks.
    // (Tolerant for the few minutes between a site update and its database
    // update, so the rest of the site keeps working either way.)
    selectAll("attendance_days", "*", "class_date").catch(() => []),
    selectAll("attendance", "course_id,class_date,student_id,status").catch(() => []),
  ]);

  // Your role changed since this page loaded: switch to the new role and
  // load again with the right view of the data.
  if (mine && (mine.role === "faculty") !== fac && !loadAll._retrying) {
    Object.assign(currentUser, { role: mine.role, superAdmin: !!mine.super_admin });
    role = mine.role;
    loadAll._retrying = true;
    try { await loadAll(); } finally { loadAll._retrying = false; }
    if (typeof renderAccountPill === "function") { renderAccountPill(); renderNav(); }
    return;
  }

  users = people.map((p) => profileToUser(p));
  if (!fac) {
    // Students never receive anyone's email — only their own.
    const me = users.find((u) => u.id === currentUser.id);
    if (me) Object.assign(me, { email: currentUser.email, status: currentUser.status, createdAt: currentUser.createdAt });
  }
  if (mine) {
    const me = users.find((u) => u.id === currentUser.id);
    if (me) Object.assign(me, profileToUser(mine));
  }
  try { await refreshAvatarUrls(users); } catch (e) { console.warn("Profile photos:", e); }
  const meFresh = users.find((u) => u.id === currentUser.id);
  if (meFresh) {
    Object.assign(currentUser, {
      name: meFresh.name, role: meFresh.role, superAdmin: meFresh.superAdmin,
      avatarPath: meFresh.avatarPath, avatarUrl: meFresh.avatarUrl,
    });
    role = meFresh.role;
  }

  const byCourse = {};
  courses = cs.map((r) => {
    const c = {
      id: r.id,
      title: r.title,
      description: r.description || "",
      credits: r.credits,
      level: r.level,
      facultyId: r.faculty_id,
      archived: r.archived,
      schedule: { weeks: r.sched_weeks, days: r.sched_days || [], time: r.sched_time, mode: r.sched_mode, startDate: r.sched_start },
      att: { on: !!r.attendance_on, weight: Number(r.attendance_weight) || 0, lateCredit: r.attendance_late_credit == null ? 50 : Number(r.attendance_late_credit) },
      attDays: {},   // date → { held, takenBy, takenAt }
      attMarks: {},  // date → { studentId: status }
      materials: [],
      assignments: [],
      studentIds: [],
      discussion: [],
      messages: [],
      enrollmentRequests: [],
    };
    byCourse[c.id] = c;
    return c;
  });

  enr.forEach((e) => byCourse[e.course_id] && byCourse[e.course_id].studentIds.push(e.student_id));
  reqs.forEach((r) => byCourse[r.course_id] && byCourse[r.course_id].enrollmentRequests.push({
    id: r.id, studentId: r.student_id, requestedAt: r.requested_at, status: "pending",
  }));
  mats.forEach((m) => byCourse[m.course_id] && byCourse[m.course_id].materials.push({
    id: m.id, type: m.type || "material", title: m.title, storagePath: m.storage_path, mimeType: m.mime_type, size: m.size_bytes,
  }));

  const byAssignment = {};
  asg.forEach((a) => {
    const c = byCourse[a.course_id];
    if (!c) return;
    const obj = {
      id: a.id, courseId: a.course_id, title: a.title, instructions: a.instructions || "", due: a.due, points: a.points,
      weight: Number(a.weight) || 0, seriesId: a.series_id || undefined, seriesLabel: a.series_label || undefined,
      submitAnytime: a.submit_anytime, openDate: a.open_date, submissions: [],
    };
    byAssignment[a.id] = obj;
    c.assignments.push(obj);
  });
  subs.forEach((s) => {
    const a = byAssignment[s.assignment_id];
    if (!a) return;
    a.submissions.push({
      id: s.id, studentId: s.student_id, status: s.status, fileName: s.file_name, storagePath: s.storage_path,
      mimeType: s.mime_type, writtenContent: s.written_content, submittedAt: s.submitted_at,
      score: s.score === null ? null : Number(s.score), feedback: s.feedback || "",
    });
  });

  const postById = {};
  posts.filter((p) => !p.parent_id).forEach((p) => {
    const c = byCourse[p.course_id];
    if (!c) return;
    const obj = { id: p.id, authorId: p.author_id, text: p.text, postedAt: p.created_at, replies: [] };
    postById[p.id] = obj;
    c.discussion.push(obj);
  });
  posts.filter((p) => p.parent_id).forEach((p) => {
    const parent = postById[p.parent_id];
    if (parent) parent.replies.push({ id: p.id, authorId: p.author_id, text: p.text, postedAt: p.created_at });
  });

  msgs.forEach((m) => byCourse[m.course_id] && byCourse[m.course_id].messages.push({
    id: m.id, studentId: m.student_id, from: m.from_role, senderId: m.sender_id, text: m.text, sentAt: m.sent_at, read: m.read,
  }));

  notifications = notifs.map((n) => ({ id: n.id, toUserId: n.user_id, subject: n.subject, sentAt: n.created_at, read: n.read }));
  attDays.forEach((d) => {
    const c = byCourse[d.course_id];
    if (c) c.attDays[d.class_date] = { held: d.held, takenBy: d.taken_by, takenAt: d.taken_at };
  });
  attMarks.forEach((m) => {
    const c = byCourse[m.course_id];
    if (c) (c.attMarks[m.class_date] = c.attMarks[m.class_date] || {})[m.student_id] = m.status;
  });
  bibleHighlightRows = hls;
  dataLoadedAt = Date.now();
}

async function refreshNotifications() {
  if (!currentUser) return;
  const data = must(await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(60));
  notifications = data.map((n) => ({ id: n.id, toUserId: n.user_id, subject: n.subject, sentAt: n.created_at, read: n.read }));
}

async function fetchThread(courseId, studentId) {
  const data = must(await sb.from("messages").select("*").eq("course_id", courseId).eq("student_id", studentId).order("sent_at"));
  return data.map((m) => ({ id: m.id, studentId: m.student_id, from: m.from_role, senderId: m.sender_id, text: m.text, sentAt: m.sent_at, read: m.read }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
const DB = {
  // --- courses -------------------------------------------------------------
  async createCourse({ title, description, credits, level, facultyId, att }) {
    const a = att || { on: false, weight: 0, lateCredit: 50 };
    const row = must(await sb.from("courses").insert({
      title, description, credits, level, faculty_id: facultyId || null,
      attendance_on: a.on, attendance_weight: a.on ? a.weight : 0, attendance_late_credit: a.lateCredit,
    }).select("id").single());
    return row.id;
  },
  async updateCourse(id, patch) {
    must(await sb.from("courses").update(patch).eq("id", id));
  },
  async saveSchedule(id, s) {
    must(await sb.from("courses").update({
      sched_weeks: s.weeks, sched_days: s.days, sched_time: s.time, sched_mode: s.mode, sched_start: s.startDate,
    }).eq("id", id));
  },
  async setArchived(id, archived) {
    // Archiving ends the enrollment relationship the private threads belong
    // to; the database clears them itself (so it works for an Admin
    // who can't read them).
    must(await sb.from("courses").update({ archived }).eq("id", id));
  },
  async deleteCourse(id) {
    // Remove the course's files from storage first (best effort), then the
    // course itself — every row tied to it is removed by the database.
    for (const bucket of ["materials", "submissions"]) {
      try { await removeFolder(bucket, id); } catch (e) { console.warn("Storage cleanup:", e); }
    }
    must(await sb.from("courses").delete().eq("id", id));
  },

  // --- materials -----------------------------------------------------------
  async addMaterials(courseId, files) {
    files.forEach((f) => checkUpload(f, MATERIAL_MAX_BYTES));
    for (const f of files) {
      const path = `${courseId}/${newId()}-${safeFileName(f.name)}`;
      must(await sb.storage.from("materials").upload(path, f, { contentType: f.type || undefined, upsert: false }));
      must(await sb.from("materials").insert({ course_id: courseId, type: "material", title: f.name, storage_path: path, mime_type: f.type || null, size_bytes: f.size }));
    }
  },
  async removeMaterial(m) {
    must(await sb.from("materials").delete().eq("id", m.id));
    if (m.storagePath) await sb.storage.from("materials").remove([m.storagePath]);
  },
  async fileUrl(bucket, path, downloadName) {
    const opts = downloadName ? { download: downloadName } : undefined;
    const data = must(await sb.storage.from(bucket).createSignedUrl(path, 60 * 60, opts));
    return data.signedUrl;
  },

  // --- assignments & submissions -------------------------------------------
  async addAssignments(courseId, list) {
    must(await sb.from("assignments").insert(list.map((a) => ({
      course_id: courseId, title: a.title, instructions: a.instructions || "", due: a.due, points: a.points,
      weight: a.weight || 0, series_id: a.seriesId || null, series_label: a.seriesLabel || null,
      submit_anytime: a.submitAnytime !== false, open_date: a.openDate || null,
    }))));
  },
  async deleteAssignments(ids) {
    must(await sb.from("assignments").delete().in("id", ids));
  },
  // A student saving or turning in their own work.
  async saveSubmission({ courseId, assignment, studentId, status, file, writtenContent, previous }) {
    const row = { assignment_id: assignment.id, student_id: studentId, status };
    if (file) {
      checkUpload(file, SUBMISSION_MAX_BYTES);
      const path = `${courseId}/${assignment.id}/${studentId}/${newId()}-${safeFileName(file.name)}`;
      must(await sb.storage.from("submissions").upload(path, file, { contentType: file.type || undefined, upsert: false }));
      Object.assign(row, { file_name: file.name, storage_path: path, mime_type: file.type || null, written_content: null });
    } else if (writtenContent !== undefined) {
      Object.assign(row, { written_content: writtenContent });
      if (writtenContent && status === "submitted") Object.assign(row, { file_name: null, storage_path: null, mime_type: null });
    }
    must(await sb.from("submissions").upsert(row, { onConflict: "assignment_id,student_id" }));
    // Tidy up a replaced file (best effort — never blocks the turn-in).
    if (previous && previous.storagePath && previous.storagePath !== row.storage_path && (file || row.storage_path === null)) {
      sb.storage.from("submissions").remove([previous.storagePath]).catch(() => {});
    }
  },
  async grade({ assignmentId, studentId, score, feedback }) {
    must(await sb.from("submissions").upsert(
      { assignment_id: assignmentId, student_id: studentId, status: "graded", score, feedback },
      { onConflict: "assignment_id,student_id" }
    ));
  },

  // --- enrollment ----------------------------------------------------------
  async requestEnrollment(courseId) {
    must(await sb.from("enrollment_requests").insert({ course_id: courseId, student_id: currentUser.id }));
  },
  async withdrawRequest(courseId) {
    must(await sb.from("enrollment_requests").delete().eq("course_id", courseId).eq("student_id", currentUser.id));
  },
  async approveEnrollment(courseId, studentId) {
    must(await sb.rpc("approve_enrollment", { p_course: courseId, p_student: studentId }));
  },
  async denyEnrollment(courseId, studentId, note) {
    must(await sb.rpc("deny_enrollment", { p_course: courseId, p_student: studentId, p_note: note }));
  },
  async enroll(courseId, studentId) {
    must(await sb.from("enrollments").insert({ course_id: courseId, student_id: studentId }));
  },
  async unenroll(courseId, studentId) {
    // The database also clears this student's private thread for the course.
    must(await sb.from("enrollments").delete().eq("course_id", courseId).eq("student_id", studentId));
  },

  // --- discussion & messages -----------------------------------------------
  async post(courseId, text, parentId = null) {
    must(await sb.from("discussion_posts").insert({ course_id: courseId, parent_id: parentId, author_id: currentUser.id, text }));
  },
  async deletePost(id) {
    must(await sb.from("discussion_posts").delete().eq("id", id));
  },
  async sendMessage(courseId, studentId, fromRole, text) {
    must(await sb.from("messages").insert({ course_id: courseId, student_id: studentId, sender_id: currentUser.id, from_role: fromRole, text }));
  },
  async markThreadRead(courseId, studentId) {
    must(await sb.rpc("mark_thread_read", { p_course: courseId, p_student: studentId }));
  },
  // Clearing removes notifications for good (each person can only ever
  // remove their own — the database checks).
  async deleteNotifications(ids) {
    if (!ids.length) return;
    must(await sb.from("notifications").delete().in("id", ids));
  },
  async markNotificationsRead(ids) {
    if (!ids.length) return;
    must(await sb.from("notifications").update({ read: true }).in("id", ids));
  },

  // --- people --------------------------------------------------------------
  async updateProfile(id, patch) {
    must(await sb.from("profiles").update(patch).eq("id", id));
  },
  async saveProfile(id, f) {
    must(await sb.from("profiles").update({
      name: f.name, phone: f.phone, address_line: f.addressLine, city: f.city, state: f.state,
      postal_code: f.postalCode, home_church: f.homeChurch, bio: f.bio,
    }).eq("id", id));
  },
  // `blob` is the already-cropped, already-shrunk square JPEG.
  async setAvatar(userId, blob, oldPath) {
    if (blob.size > AVATAR_MAX_BYTES) throw new Error("That photo is still too large after shrinking it. Try a different photo.");
    const path = `${userId}/${newId()}.jpg`;
    must(await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: false }));
    try {
      must(await sb.from("profiles").update({ avatar_path: path }).eq("id", userId));
    } catch (e) {
      sb.storage.from("avatars").remove([path]).catch(() => {});
      throw e;
    }
    if (oldPath) sb.storage.from("avatars").remove([oldPath]).catch(() => {});
  },
  async removeAvatar(userId, oldPath) {
    must(await sb.from("profiles").update({ avatar_path: null }).eq("id", userId));
    if (oldPath) sb.storage.from("avatars").remove([oldPath]).catch(() => {});
  },
  async deleteUser(id) {
    // Their profile photos first (best effort) — the database can't reach
    // into file storage on its own.
    try { await removeFolder("avatars", id); } catch (e) { console.warn("Storage cleanup:", e); }
    must(await sb.rpc("delete_user", { p_user: id }));
  },

  // --- attendance --------------------------------------------------------
  async saveAttendance(courseId, date, held, marks) {
    must(await sb.rpc("save_attendance", { p_course: courseId, p_date: date, p_held: held, p_marks: marks }));
  },
  async clearAttendance(courseId, date) {
    must(await sb.rpc("clear_attendance", { p_course: courseId, p_date: date }));
  },

  // --- phone reminders -----------------------------------------------------
  async pushPublicKey() {
    return must(await sb.rpc("push_public_key"));
  },
  async registerPush(sub, device) {
    const j = sub.toJSON();
    must(await sb.rpc("register_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: device }));
  },
  async unregisterPush(endpoint) {
    must(await sb.from("push_subscriptions").delete().eq("endpoint", endpoint));
  },
  async myPushDevices() {
    return must(await sb.from("push_subscriptions").select("endpoint,device,created_at"));
  },
  // Phone calendar: the person's private subscription link code.
  async myCalendarToken() {
    return must(await sb.rpc("my_calendar_token"));
  },
  async resetCalendarToken() {
    return must(await sb.rpc("reset_calendar_token"));
  },
  // The reminder function lives at Supabase; these two calls set it up the
  // first time and send a test notification.
  async reminderFunction(query) {
    const { data } = await sb.auth.getSession();
    const token = data && data.session ? data.session.access_token : "";
    const res = await fetch(`${TNBBI_CONFIG.supabaseUrl}/functions/v1/attendance-reminders?${query}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: TNBBI_CONFIG.supabaseAnonKey, "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "The reminder service isn't set up yet.");
    return body;
  },

  // --- Study Bible -----------------------------------------------------------
  async setHighlight(verseKey, reference, verseText, on) {
    if (on) {
      must(await sb.from("bible_highlights").upsert({ user_id: currentUser.id, verse_key: verseKey, reference, verse_text: verseText }, { onConflict: "user_id,verse_key" }));
    } else {
      must(await sb.from("bible_highlights").delete().eq("user_id", currentUser.id).eq("verse_key", verseKey));
    }
  },
};

// Remove every file under a top-level folder of a bucket (storage has no
// "delete folder", so list and remove in batches, recursing into subfolders).
async function removeFolder(bucket, prefix) {
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return;
  const files = [];
  for (const item of data) {
    const full = `${prefix}/${item.name}`;
    if (item.id === null) await removeFolder(bucket, full);
    else files.push(full);
  }
  if (files.length) await sb.storage.from(bucket).remove(files);
}
