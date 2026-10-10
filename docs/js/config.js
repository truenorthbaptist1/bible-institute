// ============================================================================
// Site settings — the ONLY file you need to edit before deploying.
//
// Both values come from Supabase → Project Settings → API Keys:
//   supabaseUrl      → the project URL
//   supabaseAnonKey  → the "publishable" key (safe to publish — the
//                      database's privacy rules are what protect the data)
//
// NEVER paste a "secret" (sb_secret_…) or "service_role" key here.
// ============================================================================
window.TNBBI_CONFIG = {
  supabaseUrl: "https://qcxtfrfpldprblukybao.supabase.co",
  supabaseAnonKey: "sb_publishable_XEQLBju__LEk_gkg2sw8yA_hhbSmkgE",

  // Shows a slim "Test site" banner across the top while you're testing.
  // Set to false when you go live.
  testMode: false,

  // The church's Google account — the founding Super Admin the first time it
  // signs in with Google. (The database enforces this too; this copy only
  // decides when the site bothers to ask.)
  bootstrapAdminEmail: "truenorthbaptist1@gmail.com",

  // Turns PowerPoint files and Google Slides links into slides (Teach mode).
  // This is the name of the Supabase Edge Function that does the converting
  // through the church's Google Drive. Remove this line to switch it off —
  // teachers can still add PDFs.
  slideConverter: "convert-slides",
};
