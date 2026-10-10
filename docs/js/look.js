// True North Baptist Church Bible Institute — the look and feel.
//
//   • Photo banners (Alaska scenery from the church's own photos — no people)
//     with a time-of-day greeting and a KJV verse of the day.
//   • Course cards: a color and emblem for each course, the teacher, and a
//     progress ring (how far through the term, lectures watched, work due).
//   • The sign-in page: a full photo with 2 Timothy 2:15.
//   • A short "Well done" when work is turned in.
// Verse text is copied from this site's own KJV (docs/bible/kjv-plain.txt).

const VERSES = {"student": [{"ref": "Joshua 1:9", "text": "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", "key": "JOS.1.9"}, {"ref": "Psalm 1:1-2", "text": "Blessed is the man that walketh not in the counsel of the ungodly, nor standeth in the way of sinners, nor sitteth in the seat of the scornful. But his delight is in the law of the LORD; and in his law doth he meditate day and night.", "key": "PSA.1.1"}, {"ref": "Psalm 19:7", "text": "The law of the LORD is perfect, converting the soul: the testimony of the LORD is sure, making wise the simple.", "key": "PSA.19.7"}, {"ref": "Psalm 23:1", "text": "The LORD is my shepherd; I shall not want.", "key": "PSA.23.1"}, {"ref": "Psalm 27:1", "text": "The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?", "key": "PSA.27.1"}, {"ref": "Psalm 37:4", "text": "Delight thyself also in the LORD; and he shall give thee the desires of thine heart.", "key": "PSA.37.4"}, {"ref": "Psalm 46:1", "text": "God is our refuge and strength, a very present help in trouble.", "key": "PSA.46.1"}, {"ref": "Psalm 90:12", "text": "So teach us to number our days, that we may apply our hearts unto wisdom.", "key": "PSA.90.12"}, {"ref": "Psalm 119:11", "text": "Thy word have I hid in mine heart, that I might not sin against thee.", "key": "PSA.119.11"}, {"ref": "Psalm 119:18", "text": "Open thou mine eyes, that I may behold wondrous things out of thy law.", "key": "PSA.119.18"}, {"ref": "Psalm 119:105", "text": "Thy word is a lamp unto my feet, and a light unto my path.", "key": "PSA.119.105"}, {"ref": "Psalm 119:130", "text": "The entrance of thy words giveth light; it giveth understanding unto the simple.", "key": "PSA.119.130"}, {"ref": "Proverbs 1:7", "text": "The fear of the LORD is the beginning of knowledge: but fools despise wisdom and instruction.", "key": "PRO.1.7"}, {"ref": "Proverbs 3:5-6", "text": "Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.", "key": "PRO.3.5"}, {"ref": "Proverbs 4:7", "text": "Wisdom is the principal thing; therefore get wisdom: and with all thy getting get understanding.", "key": "PRO.4.7"}, {"ref": "Proverbs 9:10", "text": "The fear of the LORD is the beginning of wisdom: and the knowledge of the holy is understanding.", "key": "PRO.9.10"}, {"ref": "Isaiah 26:3", "text": "Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee.", "key": "ISA.26.3"}, {"ref": "Isaiah 40:8", "text": "The grass withereth, the flower fadeth: but the word of our God shall stand for ever.", "key": "ISA.40.8"}, {"ref": "Isaiah 40:31", "text": "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.", "key": "ISA.40.31"}, {"ref": "Lamentations 3:22-23", "text": "It is of the LORD'S mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.", "key": "LAM.3.22"}, {"ref": "Micah 6:8", "text": "He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?", "key": "MIC.6.8"}, {"ref": "Matthew 5:6", "text": "Blessed are they which do hunger and thirst after righteousness: for they shall be filled.", "key": "MAT.5.6"}, {"ref": "Matthew 6:33", "text": "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.", "key": "MAT.6.33"}, {"ref": "Matthew 11:29", "text": "Take my yoke upon you, and learn of me; for I am meek and lowly in heart: and ye shall find rest unto your souls.", "key": "MAT.11.29"}, {"ref": "Matthew 28:19-20", "text": "Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost: Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you alway, even unto the end of the world. Amen.", "key": "MAT.28.19"}, {"ref": "John 1:1", "text": "In the beginning was the Word, and the Word was with God, and the Word was God.", "key": "JHN.1.1"}, {"ref": "John 3:16", "text": "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", "key": "JHN.3.16"}, {"ref": "John 8:31-32", "text": "Then said Jesus to those Jews which believed on him, If ye continue in my word, then are ye my disciples indeed; And ye shall know the truth, and the truth shall make you free.", "key": "JHN.8.31"}, {"ref": "John 14:6", "text": "Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.", "key": "JHN.14.6"}, {"ref": "John 17:17", "text": "Sanctify them through thy truth: thy word is truth.", "key": "JHN.17.17"}, {"ref": "Acts 17:11", "text": "These were more noble than those in Thessalonica, in that they received the word with all readiness of mind, and searched the scriptures daily, whether those things were so.", "key": "ACT.17.11"}, {"ref": "Romans 8:28", "text": "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.", "key": "ROM.8.28"}, {"ref": "Romans 10:17", "text": "So then faith cometh by hearing, and hearing by the word of God.", "key": "ROM.10.17"}, {"ref": "Romans 12:1", "text": "I beseech you therefore, brethren, by the mercies of God, that ye present your bodies a living sacrifice, holy, acceptable unto God, which is your reasonable service.", "key": "ROM.12.1"}, {"ref": "Romans 12:2", "text": "And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.", "key": "ROM.12.2"}, {"ref": "Romans 15:4", "text": "For whatsoever things were written aforetime were written for our learning, that we through patience and comfort of the scriptures might have hope.", "key": "ROM.15.4"}, {"ref": "1 Corinthians 15:58", "text": "Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.", "key": "1CO.15.58"}, {"ref": "2 Corinthians 5:17", "text": "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.", "key": "2CO.5.17"}, {"ref": "Galatians 2:20", "text": "I am crucified with Christ: nevertheless I live; yet not I, but Christ liveth in me: and the life which I now live in the flesh I live by the faith of the Son of God, who loved me, and gave himself for me.", "key": "GAL.2.20"}, {"ref": "Galatians 6:9", "text": "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", "key": "GAL.6.9"}, {"ref": "Ephesians 2:8-9", "text": "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast.", "key": "EPH.2.8"}, {"ref": "Ephesians 3:20", "text": "Now unto him that is able to do exceeding abundantly above all that we ask or think, according to the power that worketh in us…", "key": "EPH.3.20"}, {"ref": "Philippians 1:6", "text": "Being confident of this very thing, that he which hath begun a good work in you will perform it until the day of Jesus Christ…", "key": "PHP.1.6"}, {"ref": "Philippians 4:13", "text": "I can do all things through Christ which strengtheneth me.", "key": "PHP.4.13"}, {"ref": "Colossians 3:16", "text": "Let the word of Christ dwell in you richly in all wisdom; teaching and admonishing one another in psalms and hymns and spiritual songs, singing with grace in your hearts to the Lord.", "key": "COL.3.16"}, {"ref": "Colossians 3:23", "text": "And whatsoever ye do, do it heartily, as to the Lord, and not unto men…", "key": "COL.3.23"}, {"ref": "2 Timothy 2:15", "text": "Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.", "key": "2TI.2.15"}, {"ref": "2 Timothy 3:16-17", "text": "All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness: That the man of God may be perfect, throughly furnished unto all good works.", "key": "2TI.3.16"}, {"ref": "Hebrews 4:12", "text": "For the word of God is quick, and powerful, and sharper than any twoedged sword, piercing even to the dividing asunder of soul and spirit, and of the joints and marrow, and is a discerner of the thoughts and intents of the heart.", "key": "HEB.4.12"}, {"ref": "James 1:5", "text": "If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.", "key": "JAS.1.5"}, {"ref": "James 1:22", "text": "But be ye doers of the word, and not hearers only, deceiving your own selves.", "key": "JAS.1.22"}, {"ref": "1 Peter 2:2", "text": "As newborn babes, desire the sincere milk of the word, that ye may grow thereby…", "key": "1PE.2.2"}, {"ref": "1 Peter 3:15", "text": "But sanctify the Lord God in your hearts: and be ready always to give an answer to every man that asketh you a reason of the hope that is in you with meekness and fear…", "key": "1PE.3.15"}, {"ref": "2 Peter 3:18", "text": "But grow in grace, and in the knowledge of our Lord and Saviour Jesus Christ. To him be glory both now and for ever. Amen.", "key": "2PE.3.18"}, {"ref": "1 John 1:9", "text": "If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness.", "key": "1JN.1.9"}, {"ref": "Jude 1:3", "text": "Beloved, when I gave all diligence to write unto you of the common salvation, it was needful for me to write unto you, and exhort you that ye should earnestly contend for the faith which was once delivered unto the saints.", "key": "JUD.1.3"}], "teacher": [{"ref": "Ezra 7:10", "text": "For Ezra had prepared his heart to seek the law of the LORD, and to do it, and to teach in Israel statutes and judgments.", "key": "EZR.7.10"}, {"ref": "Nehemiah 8:8", "text": "So they read in the book in the law of God distinctly, and gave the sense, and caused them to understand the reading.", "key": "NEH.8.8"}, {"ref": "Psalm 78:4", "text": "We will not hide them from their children, shewing to the generation to come the praises of the LORD, and his strength, and his wonderful works that he hath done.", "key": "PSA.78.4"}, {"ref": "Psalm 145:4", "text": "One generation shall praise thy works to another, and shall declare thy mighty acts.", "key": "PSA.145.4"}, {"ref": "Proverbs 9:9", "text": "Give instruction to a wise man, and he will be yet wiser: teach a just man, and he will increase in learning.", "key": "PRO.9.9"}, {"ref": "Proverbs 27:17", "text": "Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.", "key": "PRO.27.17"}, {"ref": "Isaiah 50:4", "text": "The Lord GOD hath given me the tongue of the learned, that I should know how to speak a word in season to him that is weary: he wakeneth morning by morning, he wakeneth mine ear to hear as the learned.", "key": "ISA.50.4"}, {"ref": "Isaiah 55:11", "text": "So shall my word be that goeth forth out of my mouth: it shall not return unto me void, but it shall accomplish that which I please, and it shall prosper in the thing whereto I sent it.", "key": "ISA.55.11"}, {"ref": "Jeremiah 3:15", "text": "And I will give you pastors according to mine heart, which shall feed you with knowledge and understanding.", "key": "JER.3.15"}, {"ref": "Daniel 12:3", "text": "And they that be wise shall shine as the brightness of the firmament; and they that turn many to righteousness as the stars for ever and ever.", "key": "DAN.12.3"}, {"ref": "Matthew 28:19-20", "text": "Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost: Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you alway, even unto the end of the world. Amen.", "key": "MAT.28.19"}, {"ref": "Acts 20:27", "text": "For I have not shunned to declare unto you all the counsel of God.", "key": "ACT.20.27"}, {"ref": "Acts 20:28", "text": "Take heed therefore unto yourselves, and to all the flock, over the which the Holy Ghost hath made you overseers, to feed the church of God, which he hath purchased with his own blood.", "key": "ACT.20.28"}, {"ref": "1 Corinthians 4:2", "text": "Moreover it is required in stewards, that a man be found faithful.", "key": "1CO.4.2"}, {"ref": "1 Corinthians 15:58", "text": "Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.", "key": "1CO.15.58"}, {"ref": "2 Corinthians 4:5", "text": "For we preach not ourselves, but Christ Jesus the Lord; and ourselves your servants for Jesus' sake.", "key": "2CO.4.5"}, {"ref": "Galatians 6:9", "text": "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", "key": "GAL.6.9"}, {"ref": "Ephesians 4:11-12", "text": "And he gave some, apostles; and some, prophets; and some, evangelists; and some, pastors and teachers; For the perfecting of the saints, for the work of the ministry, for the edifying of the body of Christ…", "key": "EPH.4.11"}, {"ref": "Colossians 1:28", "text": "Whom we preach, warning every man, and teaching every man in all wisdom; that we may present every man perfect in Christ Jesus…", "key": "COL.1.28"}, {"ref": "1 Timothy 4:13", "text": "Till I come, give attendance to reading, to exhortation, to doctrine.", "key": "1TI.4.13"}, {"ref": "1 Timothy 4:16", "text": "Take heed unto thyself, and unto the doctrine; continue in them: for in doing this thou shalt both save thyself, and them that hear thee.", "key": "1TI.4.16"}, {"ref": "2 Timothy 2:2", "text": "And the things that thou hast heard of me among many witnesses, the same commit thou to faithful men, who shall be able to teach others also.", "key": "2TI.2.2"}, {"ref": "2 Timothy 2:15", "text": "Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.", "key": "2TI.2.15"}, {"ref": "2 Timothy 2:24", "text": "And the servant of the Lord must not strive; but be gentle unto all men, apt to teach, patient…", "key": "2TI.2.24"}, {"ref": "2 Timothy 4:2", "text": "Preach the word; be instant in season, out of season; reprove, rebuke, exhort with all longsuffering and doctrine.", "key": "2TI.4.2"}, {"ref": "Titus 2:1", "text": "But speak thou the things which become sound doctrine…", "key": "TIT.2.1"}, {"ref": "Titus 2:7", "text": "In all things shewing thyself a pattern of good works: in doctrine shewing uncorruptness, gravity, sincerity…", "key": "TIT.2.7"}, {"ref": "1 Peter 4:10", "text": "As every man hath received the gift, even so minister the same one to another, as good stewards of the manifold grace of God.", "key": "1PE.4.10"}, {"ref": "1 Peter 5:2-3", "text": "Feed the flock of God which is among you, taking the oversight thereof, not by constraint, but willingly; not for filthy lucre, but of a ready mind; Neither as being lords over God's heritage, but being ensamples to the flock.", "key": "1PE.5.2"}], "celebrate": [{"ref": "Galatians 6:9", "text": "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", "key": "GAL.6.9"}, {"ref": "1 Corinthians 15:58", "text": "Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.", "key": "1CO.15.58"}, {"ref": "Colossians 3:23", "text": "And whatsoever ye do, do it heartily, as to the Lord, and not unto men…", "key": "COL.3.23"}, {"ref": "Philippians 1:6", "text": "Being confident of this very thing, that he which hath begun a good work in you will perform it until the day of Jesus Christ…", "key": "PHP.1.6"}, {"ref": "2 Timothy 2:15", "text": "Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.", "key": "2TI.2.15"}, {"ref": "Psalm 90:17", "text": "And let the beauty of the LORD our God be upon us: and establish thou the work of our hands upon us; yea, the work of our hands establish thou it.", "key": "PSA.90.17"}, {"ref": "Matthew 25:21", "text": "His lord said unto him, Well done, thou good and faithful servant: thou hast been faithful over a few things, I will make thee ruler over many things: enter thou into the joy of thy lord.", "key": "MAT.25.21"}, {"ref": "Hebrews 6:10", "text": "For God is not unrighteous to forget your work and labour of love, which ye have shewed toward his name, in that ye have ministered to the saints, and do minister.", "key": "HEB.6.10"}]};

const PHOTOS = {
  student: ["river-sunset", "fireweed", "sunset-tree", "river-peaks", "mountain-path", "cliffs", "snow-peak", "tide-rocks"],
  teacher: ["snow-peak", "river-peaks", "mountain-path", "tide-rocks", "sunset-tree", "fireweed", "river-sunset", "cliffs"],
  signin: ["mountain-path", "snow-peak", "river-peaks", "river-sunset", "sunset-tree"],
};
const SLIDE_MS = 9000; // how long each photo shows before fading to the next
function dayNumber(d = new Date()) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
}
function todaysVerse(kind) {
  // Short enough to sit comfortably on the banner, even on a phone.
  const list = (VERSES[kind] || VERSES.student).filter((v) => v.text.length <= 190);
  return list[(dayNumber() * 7 + new Date().getFullYear()) % list.length];
}
// The photos for a banner, starting somewhere new on each visit.
function photoOrder(kind) {
  const list = PHOTOS[kind] || PHOTOS.student;
  let start = 0;
  try {
    const k = "tnbbi-photo:" + kind;
    start = (parseInt(sessionStorage.getItem(k) || String(Math.floor(Math.random() * list.length)), 10) + 1) % list.length;
    sessionStorage.setItem(k, String(start));
  } catch (e) { start = Math.floor(Math.random() * list.length); }
  return list.slice(start).concat(list.slice(0, start));
}
function isSmallScreen() { return !!(window.matchMedia && window.matchMedia("(max-width: 700px)").matches); }
function slidesHtml(order) {
  const small = isSmallScreen();
  return `<div class="slides" aria-hidden="true">${order.map((p, i) =>
    `<div class="slide ${i === 0 ? "on" : ""}" ${i === 0 ? `style="background-image:url('${photoUrl(p, small)}')"` : `data-src="${photoUrl(p, small)}"`}></div>`).join("")}</div>`;
}
// Cross-fades a banner's photos, one after another. Returns the timer.
function startSlides(root) {
  const slides = root ? [...root.querySelectorAll(".slide")] : [];
  if (slides.length < 2 || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return null;
  let i = 0;
  const load = (el) => { if (el.dataset.src) { el.style.backgroundImage = `url('${el.dataset.src}')`; delete el.dataset.src; } };
  load(slides[1]);
  return setInterval(() => {
    if (!root.isConnected || document.hidden) return;
    const next = (i + 1) % slides.length;
    load(slides[next]);
    load(slides[(next + 1) % slides.length]); // have the one after ready too
    slides[i].classList.remove("on");
    slides[next].classList.add("on");
    i = next;
  }, SLIDE_MS);
}
// Absolute, because the CSS that draws it lives in css/ (relative URLs in CSS
// variables resolve against the stylesheet).
function photoUrl(name, small) { return new URL(`brand/photo-${name}${small ? "-sm" : ""}.jpg`, document.baseURI).href; }
function greetingWord(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// --- the dashboard banner ------------------------------------------------------
function heroHtml(kind) {
  const first = currentUser && currentUser.name ? currentUser.name.trim().split(/\s+/)[0] : "";
  const who = kind === "teacher" ? (first ? `Professor ${esc(first)}` : "Professor") : esc(first || "friend");
  const v = todaysVerse(kind);
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  return `<section class="hero page-header">
    ${slidesHtml(photoOrder(kind))}
    <div class="hero-shade"></div>
    <div class="hero-inner">
      <div class="hero-eyebrow">${kind === "teacher" ? esc(staffEyebrow()) : "Student Dashboard"} · ${esc(date)}</div>
      <h1 class="hero-title">${greetingWord()}, ${who}</h1>
      <button type="button" class="hero-verse" data-verse="${v.key}" title="Read it in the Study Bible">
        <span class="hero-verse-text">“${esc(v.text)}”</span>
        <span class="hero-verse-ref">${esc(v.ref)} ${icon("bible")}</span>
      </button>
    </div>
  </section>`;
}
function wireHero(root) {
  root.querySelectorAll("[data-verse]").forEach((b) => b.addEventListener("click", () => openVerse(b.dataset.verse)));
  const t = startSlides(root.querySelector(".hero"));
  if (t && typeof viewTimers !== "undefined") viewTimers.push(t);
}
let authSlideTimer = null;
function wireAuthSlides(root) {
  clearInterval(authSlideTimer);
  authSlideTimer = startSlides(root.querySelector(".auth-photo"));
}
function openVerse(key) {
  const [book, c, v] = key.split(".");
  if (typeof sbBookId === "undefined") return;
  sbBookId = book; sbChapter = +c; sbMode = "read"; sbScrollToVerse = +v; sbFlashVerse = +v; sbOpenVerse = null;
  view = "studyBible"; renderNav(); renderMain();
}

// --- course identity: a color and an emblem ----------------------------------------
const COURSE_HUES = ["#1f3a5f", "#8c2f43", "#1d7a74", "#4f7a26", "#6b3f93", "#b0512b", "#3f6a82", "#9a7420"];
const EMBLEMS = {
  scroll: '<path d="M14 10h32a6 6 0 0 1 0 12H18"/><path d="M14 10a6 6 0 0 0 0 12h4v24a6 6 0 0 0 6 6h26a6 6 0 0 0 0-12H24"/><path d="M26 28h16M26 34h12"/>',
  book: '<path d="M32 18c-6-4-14-5-22-4v32c8-1 16 0 22 4 6-4 14-5 22-4V14c-8-1-16 0-22 4Z"/><path d="M32 18v32"/>',
  lamp: '<path d="M10 40c10 0 16-4 20-8h14c4 0 8 2 10 6"/><path d="M30 32c0-5 4-8 9-8s9 3 9 8"/><path d="M39 24c-2-3-1-7 2-10 1 4 3 6 1 10"/><path d="M14 46h40"/>',
  pulpit: '<path d="M18 22h28l-4 30H22Z"/><path d="M14 22h36"/><path d="M24 14h16l-2 8H26Z"/><path d="M32 30v12M26 36h12"/>',
  quill: '<path d="M50 10C34 14 22 28 18 46"/><path d="M50 10c-2 12-10 22-24 26"/><path d="M14 54l6-10"/><path d="M12 54h20"/>',
  mountain: '<path d="M6 50l18-26 10 14 8-10 16 22Z"/><circle cx="46" cy="16" r="5"/>',
  cross: '<path d="M32 8v48M20 22h24"/>',
  star: '<path d="M32 6l5 21 21 5-21 5-5 21-5-21-21-5 21-5Z"/><path d="M32 18v28M18 32h28" opacity=".5"/>',
  lens: '<circle cx="28" cy="28" r="14"/><path d="M38 38l14 14"/><path d="M22 28h12M28 22v12"/>',
};
function courseEmblem(c) {
  const t = (c.title + " " + (c.description || "")).toLowerCase();
  if (/history|church history|landmark|baptist/.test(t)) return "scroll";
  if (/manuscript|text|preserv|translation/.test(t)) return "quill";
  if (/homilet|preach|sermon/.test(t)) return "pulpit";
  if (/hermeneut|interpret|study method/.test(t)) return "lens";
  if (/creation|evolution|science|genesis/.test(t)) return "mountain";
  if (/biblio|scripture|bible|testament|survey/.test(t)) return "book";
  if (/doctrine|theolog|soteriolog|ecclesi|christ/.test(t)) return "cross";
  if (/mission|evangel|soul/.test(t)) return "lamp";
  return "star";
}
function courseHue(c) {
  let h = 0;
  for (const ch of String(c.title || c.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_HUES[h % COURSE_HUES.length];
}
function emblemSvg(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EMBLEMS[name] || EMBLEMS.star}</svg>`;
}

// How far along a student is in a course.
function courseProgress(c, sid) {
  const today = todayStr();
  const out = { pct: 0, line: "", sub: [] };
  const weeks = c.schedule.weeks || 0;
  if (c.pace === "self" || !c.schedule.startDate) {
    const lessons = c.lessons ? c.lessons.filter((l) => playableLesson(l)) : [];
    if (lessons.length) {
      const done = lessons.filter((l) => watchedPct(l, sid) >= WATCH_SHARE).length;
      out.pct = done / lessons.length;
      out.line = `${done} of ${lessons.length} lectures watched`;
    } else out.line = c.schedule.startDate ? "" : "Not scheduled yet";
  } else if (today < c.schedule.startDate) {
    out.line = `Starts ${fmtDay(c.schedule.startDate, { month: "short", day: "numeric" })}`;
  } else if (weeks) {
    const wk = Math.min(weeks, Math.floor(daysBetween(c.schedule.startDate, today) / 7) + 1);
    out.pct = Math.min(1, daysBetween(c.schedule.startDate, today) / (weeks * 7));
    out.line = out.pct >= 1 ? "Term complete" : `Week ${wk} of ${weeks}`;
  }
  if (sid) {
    const lessons = c.lessons ? c.lessons.filter((l) => playableLesson(l) && lessonOpensOn(c, l, sid) <= today) : [];
    if (lessons.length && c.pace !== "self" && courseHasLectures(c)) {
      const done = lessons.filter((l) => watchedPct(l, sid) >= WATCH_SHARE).length;
      out.sub.push(`${done} of ${lessons.length} lectures watched`);
    }
    const open = c.assignments.filter((a) => { const st = getSubmission(c, a, sid).status; return st !== "graded" && st !== "submitted" && !assignmentLock(a).locked; });
    const weekOut = addDaysISO(today, 7);
    const soon = open.filter((a) => dueFor(c, a, sid) <= weekOut);
    if (soon.length) out.sub.push(`${soon.length} due this week`);
    else if (c.assignments.length && !open.length) out.sub.push("All work turned in ✓");
  }
  return out;
}
function ringSvg(pct, color) {
  const r = 16, C = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
  return `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--border)" stroke-width="4"/>
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 20 20)"/>
    <text x="20" y="24" text-anchor="middle" font-size="10.5" font-weight="700" fill="currentColor">${Math.round(p * 100)}%</text></svg>`;
}
function courseCoverHtml(c, extra = "") {
  const hue = courseHue(c);
  return `<div class="ccard-cover" style="--cc:${hue}">
    ${emblemSvg(courseEmblem(c), "ccard-emblem")}
    <div class="ccard-pills">${extra}</div>
  </div>`;
}
// Student's My Courses card.
function studentCourseCardHtml(c) {
  const t = courseTeacher(c);
  const pr = courseProgress(c, currentStudentId);
  const fmt = c.format && c.format !== "in_person" ? `<span class="ccard-pill">${esc(FORMAT_LABEL[c.format])}</span>` : "";
  return `<div class="tile ccard" data-course="${c.id}" tabindex="0" role="button">
    ${courseCoverHtml(c, `<span class="ccard-pill">${esc(c.level)} Level</span>${fmt}`)}
    <div class="ccard-body">
      <h3>${esc(c.title)}</h3>
      ${t ? `<p class="ccard-teacher">${avatarHtml(t, 24)}<span>${esc(t.name)}</span></p>` : ""}
      <div class="ccard-progress">
        ${pr.pct || pr.line.startsWith("Week") ? ringSvg(pr.pct, courseHue(c)) : ""}
        <div class="ccard-progress-text">
          ${pr.line ? `<strong>${esc(pr.line)}</strong>` : ""}
          ${pr.sub.map((s) => `<small>${esc(s)}</small>`).join("")}
        </div>
      </div>
    </div>
  </div>`;
}

// --- "Well done" when work is turned in --------------------------------------
function celebrateTurnIn(title) {
  if (window.TNBBI_TEST_NO_CELEBRATE) return;
  const list = VERSES.celebrate;
  const v = list[Math.floor(Math.random() * list.length)];
  const root = document.createElement("div");
  root.className = "celebrate";
  root.setAttribute("role", "status");
  root.innerHTML = `<div class="celebrate-card">
    <div class="celebrate-check">${icon("check")}</div>
    <h3>Well done!</h3>
    <p class="celebrate-what">${esc(title)} is turned in.</p>
    <p class="celebrate-verse">“${esc(v.text)}” <span>— ${esc(v.ref)}</span></p>
  </div>`;
  document.body.appendChild(root);
  const close = () => { root.classList.add("celebrate-out"); setTimeout(() => root.remove(), 300); };
  root.addEventListener("click", close);
  setTimeout(close, 4200);
}
