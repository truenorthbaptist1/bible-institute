# True North Baptist Church Bible Institute — Setup Guide

This gets the site running at a **private test address** with real accounts,
real data, and real file storage. It takes about an hour the first time.
Nothing here costs money.

You'll set up four free things:

1. **Supabase** — the database, sign-in, and file storage
2. **GitHub Pages** — hosts the website itself
3. **Cloudflare** — points the church's own web address at it
4. **Google sign-in** — so the church account (and anyone else) can use "Continue with Google"

The Institute's address will be **https://tnbbibleinstitute.com**
(with `www.tnbbibleinstitute.com` forwarding to it). Wherever you see
`YOUR-GITHUB-USERNAME`, use the username of the GitHub account you created.

Keep a notepad open — a few steps ask you to copy a value from one place to another.

---

## What's in this folder

| Folder | What it is |
|---|---|
| `docs/` | The website. GitHub publishes this folder. (GitHub requires the name `docs`.) |
| `supabase/schema.sql` | Builds the database, including all the privacy rules. |
| `supabase/seed.sql` | Adds the Institute's eight real courses (no students — they sign up themselves). |
| `tests/` | The automated checks that were run before handing this over (see TESTING.md). You don't need these to run the site. |

---

## Step 1 — Create the Supabase project

1. Go to **supabase.com** → **Start your project** → sign in with the church Google account (`truenorthbaptist1@gmail.com`) so the project belongs to the church, not a person.
2. **New project.** Name: `tnbbi`. Set a strong database password and save it somewhere safe. Region: **West US** (closest to Alaska). Wait a minute or two while it builds.

## Step 2 — Build the database

1. In the left sidebar, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this folder in any text editor, copy **all** of it, paste it in, and click **Run**. It should finish with "Success. No rows returned."
3. New query again → paste all of `supabase/seed.sql` → **Run**.
4. Check: left sidebar → **Table Editor** → `courses` should list 8 courses.

## Step 3 — Connect the site to the database

1. Sidebar → **Project Settings** → **API** (sometimes labeled "Data API").
2. Copy the **Project URL** and the **anon public** key.
   *Never* use the key labeled `service_role` or "secret".
3. Open `docs/js/config.js` in a text editor and paste them in place of `YOUR-PROJECT-ID…` and `YOUR-ANON-PUBLIC-KEY`. Save.

## Step 4 — Put the website on GitHub

1. Sign in to the GitHub account you created. (Ideally it uses the church
   email, so the site belongs to the church rather than one person.)
2. **New repository** (the **+** at top right). Name: `bible-institute`.
   Set it to **Public** (free GitHub Pages requires that). Check
   **Add a README file**. Create.
   *Public is safe here:* nothing in these files is secret. The Supabase
   "anon" key in `config.js` is designed to be public; the database's
   privacy rules are what protect student data. Never put the
   `service_role` key in any file.
3. In the new repository: **Add file → Upload files**. Unzip this package,
   then drag the **`docs`** folder, **`supabase`** folder, **`tests`** folder,
   `SETUP.md`, and `TESTING.md` onto the page. Click **Commit changes**.
   Check that you now see a `docs` folder containing `index.html` and a
   small file named `CNAME` (it tells GitHub the site's address).
4. **Settings → Pages.** Under **Build and deployment**: Source
   **Deploy from a branch**, Branch **main**, folder **/docs**. Save.
5. Because of the `CNAME` file, the **Custom domain** box on this page
   should already say `tnbbibleinstitute.com`. It will show a DNS warning
   until you finish Step 5 — that's expected.

**Updating the site later:** open the file on GitHub, click the pencil to
edit (or upload a replacement), and commit. GitHub republishes in about a
minute; browsers may show the old version for up to 10 minutes — a hard
refresh (Ctrl+Shift+R, or ⌘+Shift+R on a Mac) shows the new one immediately.

## Step 5 — Point tnbbibleinstitute.com at GitHub (Cloudflare)

Because you registered the domain with Cloudflare, its DNS is already there.
In Cloudflare, click **tnbbibleinstitute.com**, then **DNS → Records**.

1. **Prove the domain is yours to GitHub** (stops anyone else from ever
   claiming it on GitHub):
   - GitHub → your profile picture (top right) → **Settings** → **Pages**
     (left sidebar, under "Code, planning, and automation") → **Add a domain**
     → type `tnbbibleinstitute.com` → **Add domain**.
   - GitHub shows a **TXT** record: a name beginning `_github-pages-challenge-`
     and a code.
   - In Cloudflare, **Add record**: Type **TXT**, Name = the part GitHub
     shows *before* `.tnbbibleinstitute.com`, Content = the code. **Save**.
   - Back in GitHub, click **Verify**. (If it says not found, wait 5 minutes
     and try again.)

2. **Point the address at GitHub.** If Cloudflare added any parking-page
   records for `@` or `www` when you registered, delete those first. Then
   **Add record** for each line below, with **Proxy status: DNS only**
   (gray cloud — click the orange cloud to turn it gray):

   | Type | Name | Content |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `YOUR-GITHUB-USERNAME.github.io` |

   These are GitHub Pages' published addresses. "DNS only" lets GitHub issue
   the site's security certificate. (If you ever turn the orange cloud on
   later, set Cloudflare **SSL/TLS** to **Full** — never **Flexible**, which
   causes an endless-redirect error.)

3. **Confirm in GitHub.** Repository → **Settings → Pages**. The Custom
   domain should read `tnbbibleinstitute.com`; within a few minutes it
   shows **DNS check successful**. If not, click **Remove**, re-enter
   `tnbbibleinstitute.com`, and **Save**.

4. When it becomes clickable (usually within an hour, occasionally up to a
   day), check **Enforce HTTPS**.

5. Visit **https://tnbbibleinstitute.com** — you should see the sign-in page
   with a padlock. `www.tnbbibleinstitute.com` should land there too.

## Step 6 — Tell Supabase the site's address

Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** `https://tnbbibleinstitute.com`
- **Redirect URLs:** add `https://tnbbibleinstitute.com/**`

Without this, email links and Google sign-in send people to the wrong place.

While you're in Authentication:

- **Sign In / Providers → Email:** leave **Confirm email** ON. Set **minimum password length** to 8.

## Step 7 — Real emails (needed before students can sign up)

Supabase's built-in email only delivers to your own Supabase team's addresses,
and only about 2 per hour — fine for you alone, but students' confirmation and
password-reset emails won't arrive. The simplest fix is to send through the
church Gmail account:

1. On the church Google account, turn on **2-Step Verification**
   (myaccount.google.com → Security).
2. Then create an **App password** (myaccount.google.com → search "App passwords") named `Supabase`. Copy the 16-letter password.
3. Supabase → **Authentication** → **Emails** → **SMTP Settings** → enable custom SMTP:
   - Sender email: `truenorthbaptist1@gmail.com`
   - Sender name: `True North Baptist Church Bible Institute`
   - Host: `smtp.gmail.com`  Port: `465`
   - Username: `truenorthbaptist1@gmail.com`  Password: the app password
4. Save. Gmail allows roughly 500 emails a day — plenty for the Institute.

*Optional but nice:* **Authentication → Emails → Templates** lets you reword the
"Confirm your signup" and "Reset password" emails in the Institute's voice.

## Step 8 — Google sign-in

This is the fiddliest step; take it slowly.

1. Go to **console.cloud.google.com** (church Google account) → create a project named `TNBBI`.
2. **APIs & Services → OAuth consent screen** (may be called "Google Auth Platform"):
   User type **External**; App name `True North Baptist Church Bible Institute`;
   support email = the church Gmail; App home page
   `https://tnbbibleinstitute.com`; under **Authorized domains** add both
   `tnbbibleinstitute.com` and `YOUR-PROJECT-ID.supabase.co` (your Supabase
   project's address).
   Leave it in **Testing** mode for now and add each tester's Gmail under **Test users**
   (up to 100). When you go live, click **Publish app**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
   Under **Authorized redirect URIs** add: `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`
   (Supabase shows this exact address on its Google provider page — copy it from there.)
4. Copy the **Client ID** and **Client secret**.
5. Supabase → **Authentication → Sign In / Providers → Google** → enable, paste both, save.

## Step 9 — Become the founding Super Admin

1. Open `https://tnbbibleinstitute.com`. Click **Continue with Google** and choose the **church account**.
2. You'll land on the Faculty dashboard with a gold **★ Super Admin** badge.
   (This only works with Google — typing the church email into Sign Up does not grant it.)
3. Have Pastor Phil and other teachers sign up, then promote them in
   **Settings → Users & Roles → Faculty**. Add up to 3 more Super Admins from the card at the top of Settings.
4. On each course's Manage page, set the real **schedule** and choose the **instructor** under Edit Course Details.

You're ready to test. See **TESTING.md** for how.

---

## Good to know

- **The test banner.** A gold strip says "Test site" across the top. When you go live, set `testMode: false` in `docs/js/config.js` (edit it right on GitHub).
- **Free plan pausing.** Supabase may pause a free project after a week with no use. If the site suddenly can't connect, sign in to Supabase and click **Restore**.
- **Backups.** The free plan doesn't include restorable backups. Before real coursework lives here, either move to a paid Supabase plan (daily backups) or export the tables yourself regularly (Table Editor → each table → Export to CSV).
- **The Bible text** comes from bible-api.com (public-domain KJV, free, no key). It allows about 15 chapter loads per 30 seconds per internet connection; chapters are remembered by each browser after the first read. If a whole classroom on one church Wi-Fi opens new chapters at once, someone may briefly see "busy — try again." If that becomes a real problem, the fix is loading the KJV into Supabase once.
- **Strong's tagging** is on the ten featured passages (hand-checked). Full-Bible tagging is a later one-time import of the free STEPBible dataset.
- **Resource Library links** open the original Google Drive files, so those files need to be shared with students (e.g. "Anyone with the link can view").
- **Email notifications.** The bell inside the site is real. Separate *email* alerts for new messages and grades are not set up yet — a later step.
