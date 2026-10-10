// True North Baptist Church Bible Institute — the Help center.
//
// Every answer about using the site lives here, sorted into topics for
// students, faculty, and Admins (plus topics everyone shares). A search box
// at the top finds answers as you type: it understands everyday words
// ("homework", "video", "snow day"), forgives small typos, and ranks the
// questions that fit best. Nothing leaves the page — no outside service.
//
// Also here: the "What's New" list, which the Help page shows and the
// What's New tour (js/features.js) walks through.

// ---------------------------------------------------------------------------
// What's new — newest first. who: "all" | "student" | "faculty" | "admin"
// ---------------------------------------------------------------------------
const WHATS_NEW = [
  { date: "2026-10-09", who: "student", title: "This Week", text: "The top of your Dashboard now shows your next class, what's due in the next seven days, and the next lecture to watch — one tap each." },
  { date: "2026-10-09", who: "student", title: "A simpler Dashboard", text: "Six tiles instead of eleven: Messages now holds your teachers and class discussion, and Grades holds your transcript. Your profile is under your name at the top." },
  { date: "2026-10-09", who: "faculty", title: "Needs Your Attention", text: "The top of your Dashboard lists work to grade, attendance not taken, requests, messages, and sign-ups — one tap each." },
  { date: "2026-10-09", who: "faculty", title: "Course set-up checklist", text: "New courses show a short checklist that ticks itself as you go." },
  { date: "2026-10-09", who: "all", title: "Fewer emails", text: "New accounts get email for the important things only. Change it any time in My Profile → Notifications." },
  { date: "2026-10-09", who: "all", title: "Clearer “Are you sure?”", text: "Confirmations now appear in a small box on the page." },
  { date: "2026-10-09", who: "all", title: "Courses open in tabs", text: "Each course page is now split into tabs — Overview, Lectures, Materials, and Assignments — so everything is one tap away." },
  { date: "2026-10-09", who: "all", title: "Tidier course materials", text: "Documents are grouped (Syllabus, Quizzes, Exams, Study Questions, Lessons, Presentations, Textbooks…), sorted in order, and searchable. A Word and PDF copy of the same document share one row." },
  { date: "2026-10-09", who: "all", title: "Lectures in series order", text: "Recorded lectures are listed first to last by lesson number, with “Up next” marking where you left off." },
  { date: "2026-10-09", who: "all", title: "Assignments carry their documents", text: "Open an assignment and its worksheet or quiz is right there. Weekly quizzes come out one week at a time, in order." },
  { date: "2026-10-09", who: "all", title: "Searchable Help", text: "Type a question in Help in your own words and the best answers come up instantly." },
  { date: "2026-10-09", who: "all", title: "Always starts in day view", text: "The site opens in day view every time you sign in. Tap the moon for night view; it lasts until you sign out." },
  { date: "2026-10-09", who: "faculty", title: "Teachers-only documents", text: "Check “Teachers only” beside an answer key and students will never see it." },
  { date: "2026-10-08", who: "all", title: "Hybrid & online courses", text: "Classes can be attended in the classroom, live online, or by recorded lecture. Online attendance is counted automatically." },
  { date: "2026-10-08", who: "all", title: "Lecture Archive", text: "Recorded lectures from past courses are open for study in the Resource Library." },
  { date: "2026-10-08", who: "all", title: "Past grades on transcripts", text: "Courses taken before the site existed now appear on transcripts." },
  { date: "2026-10-08", who: "faculty", title: "Reminder before class", text: "Teachers get a phone reminder 5 minutes before class if attendance hasn't been taken." },
  { date: "2026-10-04", who: "all", title: "Your phone, your way", text: "Put class days and due dates in your phone's calendar, get reminders before work is due, and get notifications by email or on your phone." },
  { date: "2026-10-04", who: "all", title: "Transcripts", text: "A permanent record of every finished course, downloadable as a PDF." },
  { date: "2026-10-04", who: "all", title: "Bigger text and a guided tour", text: "The Aa button enlarges text; the tour and Help are under the ? button." },
  { date: "2026-10-04", who: "faculty", title: "Run the class from the site", text: "Post announcements, cancel a class and notify everyone, set the meeting place and online link, and copy a course for a new term." },
  { date: "2026-10-04", who: "admin", title: "Nightly backups", text: "The site backs itself up every night and emails a copy to the church Gmail every Sunday." },
  { date: "2026-10-03", who: "all", title: "The Study Bible", text: "The whole King James Bible with Strong's Concordance — tap any word for the Hebrew or Greek." },
  { date: "2026-10-03", who: "all", title: "A full word processor", text: "Write papers right in the site, with a 📖 Scripture button that drops in any KJV passage." },
];

function whatsNewFor() {
  return WHATS_NEW.filter((w) => w.who === "all" || (w.who === "student" && role === "student")
    || (w.who === "faculty" && role !== "student") || (w.who === "admin" && isAdmin()));
}

// ---------------------------------------------------------------------------
// The answers. Each topic: { id, title, who, items: [[question, answer, extra search words]] }
// ---------------------------------------------------------------------------
const HELP_TOPICS = [
  // ----- Students ---------------------------------------------------------
  { id: "start", title: "Getting started", who: "student", items: [
    ["What's on my Dashboard?", "At the top, <strong>This Week</strong> shows your next class, everything due in the next seven days (with a ✓ once it's turned in), and the next lecture to watch — tap any of them to go straight there. Below are six tiles: <strong>My Courses</strong>, <strong>Calendar</strong>, <strong>Messages</strong> (your teachers and class discussion), <strong>Grades</strong> (with your transcript), <strong>Study Bible</strong>, and <strong>Library</strong>. Your name at the top opens My Profile; <strong>?</strong> opens Help.", "home main page tiles this week"],
    ["What is This Week?", "The card at the top of your Dashboard. It lists your next class (or a red <strong>Live now</strong> button when class is streaming), what's due in the next seven days, anything overdue, and the next lecture to watch. Tap an item to open it. <strong>See all assignments</strong> lists every assignment in every course.", "this week due soon next class todo"],
    ["How do I open My Profile?", "Tap your name (or photo) at the top of the page.", "profile settings account name"],
    ["How do I sign up for a class?", "Open <strong>My Courses</strong>. Classes you can join are listed under <strong>Available</strong> — tap <strong>Request Enrollment</strong>. Your teacher approves it and you'll get a notification. Changed your mind? Tap <strong>Withdraw</strong> while it's still waiting. If the class has already started, ask the teacher to add you.", "enroll join register"],
    ["I signed up but can't get in yet.", "New accounts are approved by the Institute before they open, to keep the site for our church family. First confirm your email (look for our message — check spam too), then you'll be let in as soon as you're approved. The waiting page checks for you by itself.", "pending approval waiting confirm"],
    ["Can I use the site on my phone?", "Yes — it's made to fit a phone. For the best experience, add it to your Home Screen: on iPhone, Safari → <strong>Share</strong> → <strong>Add to Home Screen</strong>; on Android, Chrome's menu → <strong>Add to Home screen</strong> (or Install app). It then opens like an app.", "mobile app install android iphone"],
    ["Why did it sign me out?", "For your privacy, the site signs you out after 30 minutes without any activity. A minute before, it asks if you want to stay — tap <strong>Stay signed in</strong>. Anything you were writing in the editor is kept as a draft on that device.", "logged out idle timeout"],
  ]},
  { id: "courses", title: "Inside a course", who: "student", items: [
    ["How is a course page laid out?", "Every course opens into tabs: <strong>Overview</strong> (teacher, schedule, where it meets, announcements), <strong>Lectures</strong> (recorded classes, for hybrid and online courses), <strong>Materials</strong> (the syllabus and handouts), and <strong>Assignments</strong> (what's due, with its documents).", "tabs overview layout"],
    ["Where are the handouts and syllabus?", "On the course's <strong>Materials</strong> tab. They're grouped — Syllabus, Quizzes, Exams, Study Questions, Lessons, Presentations, Textbooks, Guides &amp; Forms — and listed in order (Week 1, Week 2…). Use the search box to find one by name. Tap a document to read it right in the page; when there's a Word and a PDF copy, both are on the same row.", "materials documents handout syllabus pdf word download"],
    ["Where's this week's quiz or worksheet?", "Open the assignment (from the course's <strong>Assignments</strong> tab, the Calendar, or This Week) — its document is attached right there. Weekly quizzes come out one week at a time, in order.", "quiz worksheet weekly study questions"],
    ["Can I read documents without downloading them?", "Yes. PDFs and Word documents open inside the page. There's also a download button if you'd like a copy to print.", "open view read print"],
    ["How will I know if class is canceled?", "If your teacher cancels a class (snow, illness, or anything else), you're told right away — on the bell, and by phone and email if you've turned those on. The day is marked <strong>Canceled</strong> on your Calendar and in your phone's calendar.", "cancel snow weather storm sick no class"],
    ["Where do announcements show?", "On your Dashboard (most recent first), on the course's Overview tab, and in your notifications.", "news announcement"],
  ]},
  { id: "online", title: "Attending online & lectures", who: "student", items: [
    ["Can I take a class from far away?", "Yes, when the course is <strong>Hybrid</strong> or <strong>Online</strong>. Open the course and choose how you'll attend: in the <strong>classroom</strong>, <strong>live online</strong> (watch here as it happens), or <strong>recorded lectures</strong> (watch each one after it's posted). You can change it later.", "distance remote online hybrid"],
    ["How do I watch a lecture?", "Open the course's <strong>Lectures</strong> tab. Lectures are listed first to last; <strong>Up next</strong> marks the next one you haven't finished, and a bar shows how much of each you've watched. Tap <strong>Watch</strong>.", "video recording youtube watch lesson"],
    ["How is my attendance counted online?", "Live: watch at least 75% of the class on the course's <strong>Watch Live</strong> page — keep that page open and playing (watching in the YouTube app doesn't count). Recorded: watch 95% of the lecture within 7 days of it being posted. Only the parts you actually play count; skipping ahead doesn't.", "attendance present credit counted"],
    ["I missed a class in person. Can I make it up?", "Yes. Watch that class's recording within 7 days and your absence is changed to present automatically.", "absent missed makeup"],
    ["What is self-paced?", "Some online courses are <strong>self-paced</strong>: every lecture is open from the start, and you have one semester from the day you begin. Due dates are set from your own start date.", "self paced own pace"],
    ["How do I ask a question during a live class?", "Use the <strong>Class chat</strong> under the live stream. Your teacher sees it during class and can answer there.", "chat question live"],
    ["My internet is slow. Can I still watch?", "Yes — a phone works fine. Tap ⚙ in the video player and choose a lower quality. Your progress is saved as you go, even if your connection drops for a moment.", "slow internet buffering quality"],
    ["The video won't play.", "Refresh the page first. If it still won't play, the recording may still be processing on YouTube (new lectures can take a little while) — try again later, or send your teacher a message.", "broken not working error video"],
    ["What's the Lecture Archive?", "In the <strong>Resource Library</strong>: recorded lectures from past courses, open to every student for study. Watching there doesn't count toward any course.", "archive old lectures past"],
  ]},
  { id: "work", title: "Turning in work", who: "student", items: [
    ["How do I turn in an assignment?", "Tap the assignment in <strong>This Week</strong> on your Dashboard (or on the Calendar, or your course's Assignments tab). Attach a file — a PDF, Word document, or a photo of handwritten work — or write it right in the editor, then tap <strong>Turn In</strong>. You can replace it any time until it's graded.", "submit hand in upload homework"],
    ["Can I take a picture of handwritten work?", "Yes. On a phone, tap to attach and choose your camera or photos. Make sure the page is well lit and readable.", "photo picture camera scan"],
    ["Can I save my writing and finish later?", "Yes. As you write in the editor, a draft is saved on that device. Tap <strong>Save as In Progress</strong> to keep it with your account so you can finish on another device; your teacher won't grade it until you tap <strong>Turn In</strong>.", "draft save later"],
    ["What does “Opens” or “Locked” mean?", "Some assignments open on a certain day. Until then they show <strong>Opens</strong> with the date.", "locked opens closed"],
    ["Can I turn something in late?", "The site lets you turn in work after the due date unless your teacher has said otherwise; it's marked with the date you turned it in. Ask your teacher about their late policy.", "late overdue past due"],
    ["How do I know it went through?", "The assignment shows <strong>Turned in</strong> with the date, and This Week shows a ✓ beside it. When it's graded you'll get a notification.", "confirm submitted received"],
  ]},
  { id: "grades", title: "Grades & transcript", who: "student", items: [
    ["Where do I see my grades?", "<strong>My Grades</strong> shows each course's running grade, every score, and your teacher's comments.", "score marks"],
    ["How are letter grades figured?", "The same scale as the Institute's paper grade sheets: A+ 97–100, A 94–96, A− 90–93, B+ 87–89, B 84–86, B− 80–83, C+ 77–79, C 74–76, C− 70–73, and F below 70.", "scale percent letter"],
    ["Does attendance count toward my grade?", "In some courses. When it does, the course page shows what share of the grade it is.", "attendance percent"],
    ["What is My Transcript?", "Your permanent record of finished courses — the final grade and credits. Open <strong>Grades</strong> and tap <strong>My Transcript</strong> at the top. Your teacher records it when the course ends. Download it as a PDF any time.", "transcript record credits certificate"],
    ["I took classes before the site. Are they on my transcript?", "They should be — past grade sheets were brought in under your email. Sign up with the email the church has for you; once you're approved, those courses appear. Something missing or wrong? Write to the church office.", "past old previous courses before"],
  ]},
  // ----- Everyone ---------------------------------------------------------
  { id: "bible", title: "Study Bible", who: "all", items: [
    ["How do I use the Study Bible?", "Open <strong>Study Bible</strong> and type a reference (“John 3:16”, “Rom 8:28-39”, “Ps 23”) or pick a book and chapter. It's the King James Version (1769). The words the translators added are shown in <em>italics</em>, just as in a printed KJV.", "kjv read verse chapter"],
    ["How do I study a word in the Greek or Hebrew?", "Tap any word. The study panel shows its <strong>Strong's</strong> number, the original word and its meaning, and how the KJV translates it. Tap <strong>See every occurrence</strong> to read every verse where that word appears.", "strongs greek hebrew original concordance word study"],
    ["How do I search the Bible?", "Type words instead of a reference. Choose all words, the exact phrase, or any word, and limit it to the Old Testament, New Testament, or one book. End a word with * to catch every form — <em>believ*</em> finds believe, believed, believeth.", "search find word concordance"],
    ["What does “Are you sure?” mean?", "Before anything that can't easily be undone — deleting, removing, archiving — the site asks first in a small box. Tap the red button to go ahead, or <strong>Cancel</strong> (or press Esc) to leave things as they are.", "confirm sure delete undo"],
    ["Are there cross references?", "Yes — tap a verse number, then <strong>⇄ Cross references</strong> to see related verses and jump to them.", "cross reference related"],
    ["Can I highlight verses?", "Yes — tap a verse number, then <strong>☆ Highlight</strong>. <strong>★ My Highlights</strong> lists them all in one place.", "highlight mark favorite"],
  ]},
  { id: "writing", title: "Writing in the editor", who: "all", items: [
    ["What can the editor do?", "It's a full word processor: headings, fonts and sizes, bold and italics, colors, alignment, line spacing, lists, tables, links, footnotes, special characters (Greek, Hebrew, transliteration), find and replace, a title block, word count, full-screen writing, and print or save as PDF.", "word processor format write"],
    ["How do I put Scripture into my paper?", "Tap <strong>📖 Scripture</strong> in the editor, type a reference (or search by words), and choose how it goes in: as a block quotation, an inline quotation, or just the reference.", "insert scripture verse quote"],
    ["What if my computer dies while I'm writing?", "Your draft is saved on that device as you type. Open the same assignment again and it's there. Use <strong>Save as In Progress</strong> to keep it with your account too.", "lost crash autosave"],
  ]},
  { id: "notify", title: "Notifications, reminders & calendar", who: "all", items: [
    ["How will I know when something happens?", "The bell at the top shows new messages, grades, announcements, enrollment news, and class cancellations. You can also get them <strong>by email</strong> and <strong>on your phone</strong>. New accounts get email for the important things only — cancellations, messages, announcements, and due-date reminders; change that (to everything, a daily summary, or none) in <strong>My Profile → Notifications</strong> (tap your name at the top).", "bell alert notify email"],
    ["Can I get reminders before things are due?", "Students: in <strong>My Profile → Notifications</strong>, choose to be reminded the evening before, the morning it's due, or both. You're only reminded about work you haven't turned in.", "reminder due remind"],
    ["How do I turn on phone notifications?", "In <strong>My Profile → Notifications</strong>, tap <strong>Turn On Phone Notifications</strong> and allow them. Tap <strong>Send a Test</strong> to make sure it works. Each phone or computer is turned on separately.", "push phone notification"],
    ["Phone notifications on iPhone", "Apple requires the site on your Home Screen first: in Safari tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open the <strong>TNBBI</strong> icon, sign in, then turn notifications on in My Profile. (iOS 16.4 or newer.)", "iphone ios apple push"],
    ["Can my class schedule show in my phone's calendar?", "Yes. On the <strong>Calendar</strong> page, tap <strong>Add to My Phone's Calendar</strong> and follow the steps for iPhone or Android. Class days, due dates, and cancellations then appear in your phone's own calendar and stay up to date. Your link is private; tap <strong>Get a new link</strong> if you ever shared it by mistake.", "google calendar ical sync schedule"],
    ["How do I use the Calendar?", "Switch between <strong>Month</strong> and a two-week view, and tap <strong>Today</strong> to come back. Tap any day to see what's due and what's happening that day.", "calendar month week view"],
    ["How do I clear notifications?", "Open the bell and tap <strong>Clear all</strong>, or tap one to open it.", "clear dismiss"],
  ]},
  { id: "people", title: "Messages, discussion & library", who: "all", items: [
    ["How do I message my teacher?", "Students: open <strong>Messages</strong> and tap your teacher under <strong>Your teachers</strong>. It's a private conversation — only the two of you see it. Teachers read them in <strong>Message Inbox</strong>. <strong>Export Thread</strong> saves a copy of a conversation.", "message email contact teacher private"],
    ["What's the Discussion Board?", "A place for each class to talk through the lessons together. Students find it in <strong>Messages</strong>, under <strong>Class discussion</strong>. Everyone in the class can read and reply; please keep it gracious and on the subject (Colossians 4:6).", "discussion forum talk classmates"],
    ["What's in the Library?", "Books, articles, and studies from the church's Google Drive and the church library, searchable by topic or by course — plus the Lecture Archive of past recorded classes.", "library books resources drive"],
  ]},
  { id: "account", title: "Your account & display", who: "all", items: [
    ["I forgot my password.", "On the sign-in page, tap <strong>Forgot password?</strong> and we'll email you a link to set a new one. If you signed up with Google, just use <strong>Sign in with Google</strong>.", "password reset forgot login"],
    ["How do I sign in with Google?", "Tap <strong>Sign in with Google</strong> on the sign-in page and pick your account. Use the same Google account each time so your work stays together.", "google sign in login"],
    ["How do I change my photo or details?", "Tap your name at the top to open <strong>My Profile</strong>, then <strong>Edit Profile</strong>. Add a photo, phone, address, home church, and a few words about yourself.", "profile photo picture edit"],
    ["Who can see my profile?", "Classmates see your name, photo, home church, and About me. Only you and the faculty see your phone number and address.", "privacy who sees"],
    ["How do I make the text bigger?", "Tap the <strong>Aa</strong> button at the top of the page. Each tap makes the text a little larger, then back to normal.", "font size large zoom bigger"],
    ["Day view and night view", "The site always opens in <strong>day view</strong> when you sign in. Tap the <strong>moon</strong> at the top for night view (easier on the eyes in the evening) and the <strong>sun</strong> to go back. Night view lasts until you sign out.", "dark mode night light theme"],
    ["Who do I ask for help?", "Students: send your teacher a message from <strong>Messages</strong>. Anyone can write to the church office at truenorthbaptist1@gmail.com.", "contact support office"],
  ]},
  // ----- Faculty ----------------------------------------------------------
  { id: "f-courses", title: "Setting up a course", who: "faculty", items: [
    ["Where do I manage a course?", "<strong>Courses</strong> → tap the course. Its page has tabs: <strong>Overview</strong> (details, schedule, announcements, class days), <strong>Students</strong> (roster, requests, attendance), <strong>Lectures</strong> (hybrid and online courses), <strong>Materials</strong>, and <strong>Assignments</strong>.", "manage course page tabs"],
    ["What is the Course set-up checklist?", "At the top of a new course's Overview tab: teacher, schedule, where it meets, playlist (online courses), syllabus, assignments, and students. Each step ticks itself as you do it, and <strong>Go</strong> takes you to the right place. It disappears once everything is done.", "checklist setup steps new course"],
    ["What is Needs Your Attention?", "The card at the top of your Dashboard: work waiting to be graded, attendance not taken in the last two weeks, enrollment requests, unread messages, new sign-ups, and scheduled classes you teach that aren't fully set up (courses not on the schedule aren't listed). Tap any item to go straight there. When it says you're all caught up, there's nothing waiting.", "attention todo dashboard grade waiting"],
    ["How do I add a course?", "<strong>Courses</strong> → <strong>+ Add Course</strong>. Give it a title, description, credits, format (in person, hybrid, or online), and the teacher. Set the schedule afterward.", "new course create"],
    ["How do I set the class schedule?", "On the course's Overview tab, set the days of the week, start time, first day, and number of weeks, then <strong>Save Schedule</strong>. Class days appear on everyone's calendar. Mark a single day <strong>No class this day</strong> for holidays.", "schedule days times semester"],
    ["Where does the class meet?", "<strong>Edit Course Details</strong> has a place for the room or address and an online meeting link. Students see them on their course page and calendars.", "location room address zoom link"],
    ["How do I add or remove students?", "On the <strong>Students</strong> tab, approve or deny <strong>enrollment requests</strong> (you can send a note when denying), or tap <strong>+ Add Student</strong>. Remove a student from the roster there too.", "roster enroll add student request"],
    ["How do I reuse a course next term?", "On the course page, <strong>Copy for a New Term</strong>. It copies the details, schedule pattern, materials, lectures, and assignments (with their documents) with due dates moved to the new start date — without any students or grades.", "copy duplicate next semester term"],
  ]},
  { id: "f-materials", title: "Materials & assignments", who: "faculty", items: [
    ["How do I add course documents?", "On the <strong>Materials</strong> tab, <strong>Add a Document</strong>. You can choose many files at once. They sort themselves into groups (Syllabus, Quizzes, Exams, Study Questions, Lessons…) by name — naming them “Week 3 Study Questions” and so on keeps them in order. Files can be PDF, Word, PowerPoint, text, images, or audio, up to 50 MB each; for anything larger, share a Google Drive link in an announcement.", "upload document material handout file"],
    ["How do I keep an answer key from students?", "Check <strong>Teachers only</strong> beside the document (or before adding new ones). Faculty and Admins can still open it; students never see it. Uncheck it to share it with the class.", "answer key hidden private teacher only"],
    ["How do I add an assignment?", "On the <strong>Assignments</strong> tab, <strong>+ Add Assignment</strong>. Give it a due date, points, and a grade weight, and optionally lock it until a date. Attach its worksheet or quiz with <strong>Choose from Course Materials</strong> or upload new files.", "assignment homework create"],
    ["How do I set up weekly quizzes?", "Choose the weekly option in Add Assignment. Pick the quiz documents and they're handed out one per week in order (Quiz 1 in week 1…). Edit the week list, or tap <strong>Make it N weeks</strong> to match the number of documents. <strong>View Weeks</strong> shows the whole series.", "weekly quiz series recurring"],
    ["How do I change an assignment's documents?", "Tap <strong>Documents</strong> beside the assignment to add or remove attached documents.", "attach document change"],
  ]},
  { id: "f-online", title: "Lectures & live classes", who: "faculty", items: [
    ["How do I set up a hybrid or online course?", "In <strong>Add a Course</strong> (or <strong>Edit Course Details</strong>), choose <strong>Hybrid</strong> or <strong>Online</strong>, paste the course's YouTube <strong>playlist link</strong>, and set the class length. Online courses can also be <strong>Self-paced</strong>: every lecture open at once, and each student has one semester from the day they start.", "hybrid online setup playlist"],
    ["How do lectures get onto the site?", "Upload each class to the course's YouTube playlist as <strong>Unlisted</strong> (not Private), with embedding allowed. The site checks the playlist every 30 minutes (every 2 minutes around class time), adds the new lecture, and tells online students. Tap <strong>Check Now</strong> on the Lectures tab to look right away.", "youtube upload playlist lecture video"],
    ["How are lectures put in order?", "By the lesson number in the title (“Lesson 3 …”), then the recording date, then playlist order. Setting the video's <em>Recording date</em> in YouTube Studio puts it on the right class day; you can also <strong>Change</strong> the day on the Lectures tab.", "order sequence lesson number date"],
    ["Can I hide or replace a lecture?", "Yes. On the Lectures tab, hide one students shouldn't see, or <strong>Replace</strong> it with a better recording by pasting the new link — it keeps its place and class day. You can also add a single video by link.", "replace hide remove recording"],
    ["How does the live class work?", "Stream to a YouTube Live event that's Unlisted and in the course's playlist — the site finds it by itself and tells live students class has started. Open the Live Class from the Lectures tab to read the chat and see who's watching. When the stream ends, the recording stays in the playlist for everyone else.", "live stream broadcast"],
    ["Do I take attendance for online students?", "No — it fills itself in: 75% of the class watched live on the site, or 95% of the recording within 7 days. A classroom student you mark Absent who later watches the recording is changed to Present automatically.", "attendance online automatic"],
  ]},
  { id: "f-term", title: "During the term", who: "faculty", items: [
    ["How do I take attendance?", "When class time is near, a <strong>Take Attendance</strong> button appears on the Courses tile. You can also tap a class day on the Calendar. Mark Present, Late, Absent, or Excused (or <strong>Mark everyone present</strong>). Turn attendance on, and set its share of the grade, in Edit Course Details.", "attendance roll present absent"],
    ["How do I cancel a class (weather, illness)?", "On the course's Overview tab under <strong>Class Days</strong>, tap <strong>Cancel Class</strong> on that day (or tap the day on the Calendar). Every student is told right away by bell, phone, and email, and the day is marked canceled on all calendars. <strong>Put Back On</strong> undoes it.", "cancel snow weather sick storm"],
    ["How do I tell the whole class something?", "On the Overview tab under <strong>Announcements</strong>, write it and tap <strong>Post &amp; Notify Students</strong>.", "announcement notify class"],
    ["Where do I grade?", "<strong>Grading</strong> → a course opens the grade sheet. Tap any cell to grade, or open an assignment's submissions to grade one at a time. Turned-in files open right in the page (<strong>Read It Here</strong>); add comments the student will see.", "grade score submissions grading"],
    ["Who can see my students' grades and messages?", "Only the course's teacher. Admins manage set-up but don't see grades, turned-in work, private messages, or attendance for courses they don't teach.", "privacy grades who sees"],
  ]},
  { id: "f-end", title: "End of the course", who: "faculty", items: [
    ["How do final grades reach transcripts?", "On the grade sheet, tap <strong>Record Final Grades</strong>. Grades are filled in from the sheet; adjust any, then record. They go on each student's permanent transcript, which survives archiving and even account deletion.", "final grades transcript record"],
    ["Then what?", "Archive the course from Courses. (If final grades haven't been recorded, you'll be asked first.) Its recorded lectures move to the Lecture Archive in the Resource Library.", "archive finish end"],
  ]},
  { id: "f-users", title: "New sign-ups", who: "faculty", items: [
    ["How do I approve a new person?", "New accounts wait under <strong>Settings → Waiting for Approval</strong> once they've confirmed their email. Tap <strong>Approve</strong> (or <strong>Approve All</strong>) or <strong>Decline</strong>. You'll get a notification when someone is waiting.", "approve sign up new user pending"],
  ]},
  // ----- Admins -----------------------------------------------------------
  { id: "admin", title: "For Admins", who: "admin", items: [
    ["What can Admins do?", "Everything faculty can, plus: change anyone's level (Student, Faculty, Admin), make accounts inactive or delete them, delete courses, and manage transcripts and backups. Up to 4 people can be Admins.", "admin permissions level role"],
    ["How do I make someone a teacher?", "Settings → <strong>Users &amp; Roles</strong>: set their level to <strong>Faculty</strong>. Then open the course and choose them as its teacher (<strong>Assign</strong>).", "promote faculty teacher role"],
    ["Deactivate or delete an account", "<strong>Make Inactive</strong> signs them out and blocks sign-in but keeps everything; <strong>Reactivate</strong> brings them back. <strong>Delete Permanently</strong> removes the account (their transcript is kept).", "delete remove deactivate inactive"],
    ["Transcripts", "The <strong>Transcripts</strong> tile lists every student, including former ones. Open one to review, correct, <strong>+ Add a Past Course</strong>, or download a PDF. You can also download all transcripts at once.", "transcripts pdf"],
    ["Past grades from before the site", "Transcripts → <strong>Past Records</strong>. Import old grade sheets as a CSV file (download the template to see the columns). Each record waits under the student's email and goes onto their transcript by itself once they sign up, confirm their email, and are approved. If someone uses a different email, use <strong>Link to Account</strong>.", "past records import csv old grades"],
    ["Backups", "<strong>Settings → Backups</strong> shows the nightly backup (2 AM) and the weekly copy emailed to the church Gmail on Sundays, and lets you download a backup any time. <strong>Send Me a Test Email</strong> checks that site email works.", "backup restore download"],
  ]},
];

// ---------------------------------------------------------------------------
// Search: everyday words → the site's words, simple stemming, small typos.
// ---------------------------------------------------------------------------
const HELP_SYNONYMS = [
  ["assignment", "homework", "work", "paper", "worksheet", "quiz", "essay", "test", "exam", "task"],
  ["submit", "turn", "hand", "upload", "send", "attach"],
  ["lecture", "video", "recording", "youtube", "watch", "lesson", "sermon", "class"],
  ["live", "stream", "livestream", "broadcast"],
  ["grade", "score", "mark", "point", "percent", "gpa"],
  ["password", "login", "signin", "sign", "log", "account"],
  ["notification", "alert", "bell", "notify", "remind", "reminder", "push"],
  ["phone", "mobile", "iphone", "android", "cell", "ios", "app"],
  ["calendar", "schedule", "date", "due", "deadline", "day", "week", "month"],
  ["bible", "scripture", "verse", "kjv", "strong", "concordance", "greek", "hebrew", "word"],
  ["night", "dark", "theme", "light", "bright", "day"],
  ["text", "font", "bigger", "size", "zoom", "larger", "small", "read"],
  ["cancel", "snow", "weather", "sick", "illness", "storm", "closed"],
  ["attendance", "absent", "present", "late", "miss", "missed", "roll", "excused"],
  ["material", "document", "handout", "file", "pdf", "syllabus", "doc", "word"],
  ["teacher", "professor", "faculty", "instructor", "pastor"],
  ["transcript", "record", "credit", "certificate", "diploma"],
  ["email", "mail", "gmail", "inbox"],
  ["message", "chat", "contact", "ask", "talk", "question"],
  ["enroll", "join", "register", "signup", "request", "enrollment"],
  ["archive", "past", "old", "previous", "before", "earlier"],
  ["backup", "restore", "copy", "save"],
  ["delete", "remove", "deactivate", "inactive"],
  ["draft", "save", "autosave", "later", "progress"],
  ["online", "remote", "distance", "hybrid", "away", "internet"],
  ["picture", "photo", "camera", "image", "scan"],
];
const HELP_STOP = new Set("a an the and or of to in on for is are am be was it i me my we our you your how do does did can could what where when why who which this that there with at by from as if any not get got want need should will would its into have has please".split(" "));

function helpStem(w) {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("es") && /(ch|sh|ss|x)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
function helpWords(text) {
  return String(text).toLowerCase().replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ")
    .replace(/[’']/g, "").split(/[^a-z0-9]+/).filter((w) => w && !HELP_STOP.has(w)).map(helpStem);
}
// stem → its synonym group ids
const HELP_SYN_INDEX = (() => {
  const m = new Map();
  HELP_SYNONYMS.forEach((g, i) => g.forEach((w) => { const s = helpStem(w); if (!m.has(s)) m.set(s, new Set()); m.get(s).add(i); }));
  return m;
})();
function helpClose(a, b) {
  // true when a and b are one typo apart (only for longer words)
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function helpTopicsFor() {
  return HELP_TOPICS.filter((t) => t.who === "all" || (t.who === "student" && role === "student")
    || (t.who === "faculty" && role !== "student") || (t.who === "admin" && isAdmin()));
}

let helpIndex = null;
function buildHelpIndex() {
  helpIndex = [];
  helpTopicsFor().forEach((t) => t.items.forEach(([q, a, extra], n) => {
    helpIndex.push({ topic: t, n, q, a, qw: new Set(helpWords(q)), aw: new Set(helpWords(a)), xw: new Set(helpWords(extra || "")) });
  }));
}

// Scores every answer for the typed words; best first.
function searchHelp(query) {
  if (!helpIndex) buildHelpIndex();
  const terms = [...new Set(helpWords(query))];
  if (!terms.length) return [];
  const results = [];
  helpIndex.forEach((e) => {
    let score = 0, hits = 0;
    terms.forEach((t, k) => {
      const last = k === terms.length - 1;
      const syn = HELP_SYN_INDEX.get(t);
      let best = 0;
      const look = (set, exact, related) => {
        set.forEach((w) => {
          let s = 0;
          if (w === t) s = exact;
          else if (last && t.length >= 3 && w.startsWith(t)) s = exact * 0.8; // still typing
          else if (helpClose(w, t)) s = exact * 0.7;
          else if (syn) { const g = HELP_SYN_INDEX.get(w); if (g && [...g].some((x) => syn.has(x))) s = related; }
          if (s > best) best = s;
        });
      };
      look(e.qw, 6, 3); look(e.xw, 4, 2.5); look(e.aw, 2, 1);
      if (best) { score += best; hits++; }
    });
    if (!hits) return;
    score *= hits / terms.length; // reward answers that match more of the question
    if (e.q.toLowerCase().includes(query.trim().toLowerCase()) && query.trim().length > 3) score += 8;
    results.push({ e, score });
  });
  return results.sort((x, y) => y.score - x.score).filter((r, i, all) => r.score >= all[0].score * 0.35).slice(0, 8).map((r) => r.e);
}

function helpMark(text, query) {
  const terms = helpWords(query).filter((t) => t.length >= 3);
  let out = esc(text);
  terms.forEach((t) => { out = out.replace(new RegExp(`\\b(${t.replace(/[^a-z0-9]/g, "")}[a-z]*)`, "gi"), "<mark>$1</mark>"); });
  return out;
}

// ---------------------------------------------------------------------------
// The Help page
// ---------------------------------------------------------------------------
function renderHelp(main) {
  buildHelpIndex();
  const topics = helpTopicsFor();
  const fresh = whatsNewFor();
  const newest = fresh.length ? fresh[0].date : null;
  const latest = fresh.filter((w) => w.date === newest);
  const fmt = (d) => parseDay(d).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const popular = role === "student"
    ? ["turn in an assignment", "watch a lecture", "phone calendar", "forgot password", "night view"]
    : ["weekly quizzes", "answer key", "cancel a class", "add lectures", "final grades"];
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Help</div>
      <h1>How to Use the Institute</h1>
      <p>Ask in your own words, or browse the topics below.</p>
    </div>
    <div class="card help-search-card">
      <label class="help-search">
        ${icon("search")}
        <input type="search" id="helpQuery" placeholder="${role === "student" ? "e.g. How do I turn in my homework?" : "e.g. How do I hide an answer key?"}" autocomplete="off" aria-label="Search Help">
      </label>
      <div class="help-chips" id="helpPopular">${popular.map((p) => `<button class="help-chip" data-q="${esc(p)}">${esc(p)}</button>`).join("")}</div>
    </div>
    <div id="helpResults" aria-live="polite"></div>
    <div id="helpBrowse">
      <div class="help-top-grid">
        <div class="card help-tour-card">
          <div class="icon-badge hue-gold">${icon("help")}</div>
          <div style="flex:1;min-width:0;"><strong>Take the tour</strong><div class="field-hint" style="margin:2px 0 0;">A step-by-step look at each part of your dashboard.</div></div>
          <button class="btn btn-gold btn-sm" id="helpTour">Start the Tour</button>
        </div>
        ${latest.length ? `<div class="card help-tour-card">
          <div class="icon-badge hue-teal">${icon("bell")}</div>
          <div style="flex:1;min-width:0;"><strong>What's new</strong><div class="field-hint" style="margin:2px 0 0;">${latest.length} update${latest.length === 1 ? "" : "s"} on ${esc(fmt(newest))}.</div></div>
          <button class="btn btn-outline-gold btn-sm" id="helpNewTour">Show Me</button>
        </div>` : ""}
      </div>
      <div class="help-chips help-topics" aria-label="Topics">${topics.map((t) => `<button class="help-chip" data-topic="${t.id}">${esc(t.title)}</button>`).join("")}</div>
      ${topics.map((t) => `
        <div class="section-title" id="help-${t.id}"><h2>${esc(t.title)}</h2></div>
        <div class="card help-list">
          ${t.items.map(([q, a]) => `<details class="help-item"><summary>${esc(q)}</summary><div class="help-answer">${a}</div></details>`).join("")}
        </div>`).join("")}
      <div class="section-title" id="help-new"><h2>What's new on the site</h2></div>
      <div class="card help-list help-news">
        ${[...new Set(fresh.map((w) => w.date))].map((d) => `
          <div class="help-news-day">${esc(fmt(d))}</div>
          ${fresh.filter((w) => w.date === d).map((w) => `<div class="help-news-item"><strong>${esc(w.title)}</strong> — ${esc(w.text)}</div>`).join("")}`).join("")}
      </div>
    </div>
    <p class="help-footer">Still stuck? ${role === "student" ? "Send your teacher a message, or w" : "W"}rite to the church office at <a href="mailto:truenorthbaptist1@gmail.com">truenorthbaptist1@gmail.com</a>.</p>`;

  const q = document.getElementById("helpQuery");
  const results = document.getElementById("helpResults");
  const browse = document.getElementById("helpBrowse");
  const run = () => {
    const text = q.value;
    if (!text.trim()) { results.innerHTML = ""; browse.hidden = false; return; }
    browse.hidden = true;
    const found = searchHelp(text);
    results.innerHTML = found.length ? `
      <div class="section-title"><h2>Best answers</h2></div>
      <div class="card help-list">
        ${found.map((e, i) => `<details class="help-item" ${i === 0 ? "open" : ""}><summary><span><span class="help-topic-tag">${esc(e.topic.title)}</span>${helpMark(e.q, text)}</span></summary><div class="help-answer">${e.a}</div></details>`).join("")}
      </div>` : `
      <div class="card empty-state help-none">
        <p><strong>No answer matched that.</strong> Try other words — for example “quiz”, “video”, or “password” — or browse the topics.</p>
        <p>${role === "student" ? "You can also ask your teacher in <strong>Messages</strong>, or write" : "Or write"} to the church office at <a href="mailto:truenorthbaptist1@gmail.com">truenorthbaptist1@gmail.com</a>.</p>
        <button class="btn btn-ghost btn-sm" id="helpClear">Show All Topics</button>
      </div>`;
    const clear = document.getElementById("helpClear");
    if (clear) clear.addEventListener("click", () => { q.value = ""; run(); q.focus(); });
  };
  q.addEventListener("input", run);
  q.addEventListener("keydown", (e) => { if (e.key === "Escape") { q.value = ""; run(); } });
  main.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { q.value = b.dataset.q; run(); }));
  main.querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => {
    const el = document.getElementById("help-" + b.dataset.topic);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }));
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  document.getElementById("helpTour").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); startTour(true); });
  const nt = document.getElementById("helpNewTour");
  if (nt) nt.addEventListener("click", () => { view = "home"; renderNav(); renderMain(); startTour(true, "new"); });
}
