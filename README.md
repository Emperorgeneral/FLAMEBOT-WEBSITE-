<<<<<<< HEAD
# FLAMEBOT-WEBSITE-
=======
# FlameBot website

This is a static website with:

- `index.html` (front page / marketing)
- `download/index.html` (downloads + setup)
- `admin/index.html` (private admin dashboard UI)
- `ambassador/index.html` (private ambassador dashboard UI)

## Deploy options

- Cloudflare Pages (drag & drop or connect a Git repo)
- GitHub Pages
- Railway (connect a Git repo and deploy the `website/` folder)

## Local preview

From the `website/` folder:

- `python -m http.server 5173`
- Open `http://localhost:5173`

Note: the Windows `py` launcher may not be installed on some PCs. If `py` fails, use `python`.

## Railway deploy (simple)

This repo includes `website/package.json` so Railway can deploy the site as a small Node web service.

1) Railway: **New Project** -> **Deploy from GitHub repo**
2) In the service settings, set **Root Directory** to `website`
3) Railway will run `npm install` and then `npm start`
4) Once deployed, open the Railway-provided URL

### Security headers (recommended)

This site is static, but it is deployed on Railway as a Node service so we can send security headers.

- The HTTP headers are set by `server.js` (CSP, HSTS on HTTPS, anti-framing, etc.)
- The `website/_headers` file is included for hosts like Cloudflare Pages/Netlify, but Railway does not apply it automatically.

## Admin dashboard

The website now serves a private admin UI at `/admin/` and a private ambassador UI at `/ambassador/`.

Website service environment:

- `FLAMEBOT_BACKEND_BASE_URL`: absolute base URL of the deployed Flask backend that exposes the admin APIs.
- `FLAMEBOT_WEBSITE_ANALYTICS_SECRET`: shared secret used by the website service to send public page-visit analytics into the backend.

Backend environment:

- `FLAMEBOT_ADMIN_BOOTSTRAP_EMAIL`: Gmail address for the initial main admin.
- `FLAMEBOT_ADMIN_BOOTSTRAP_PASSWORD`: password for the initial main admin.
- `FLAMEBOT_ADMIN_SESSION_TTL_SEC` (optional): admin session lifetime in seconds.
- `FLAMEBOT_ADMIN_PASSWORD_MIN_LENGTH` (optional): minimum password length for admin accounts.
- `FLAMEBOT_PUBLIC_BASE_URL`: public HTTPS base URL for the deployed backend, used to generate webhook and ambassador dashboard links.
- `FLAMEBOT_WEBSITE_ANALYTICS_SECRET`: same shared secret configured on the website service, required for protected website traffic analytics.
- `FLAMEBOT_OWNER_TELEGRAM_ID`: numeric Telegram ID that the backend always treats as the owner profile.
- `FLAMEBOT_PREREG_TG_BOT_USERNAME`: username of the separate preregistration Telegram bot.
- `FLAMEBOT_PREREG_TG_BOT_TOKEN`: bot token for the preregistration bot webhook.
- `FLAMEBOT_PREREG_TG_WEBHOOK_SECRET` (optional): Telegram webhook secret for the preregistration bot.
- `FLAMEBOT_PREREG_TG_WEBHOOK_AUTOSET` (optional): auto-configure the preregistration bot webhook on startup.

Behavior:

- Main admin signs in at `/admin/` with the bootstrap Gmail and password.
- Before login, the admin and ambassador routes show only the sign-in shell. Dashboard views and data load only after authentication.
- The admin dashboard is split into post-login sections: Dashboard, Ambassadors, Users, Referral Tracking, and Analytics.
- Only the main admin can create ambassadors.
- Ambassadors sign in at `/ambassador/` with the Gmail and password assigned by the main admin.
- Ambassadors see only users whose `referred_by_telegram_id` matches their Telegram identity.
- The admin homepage stays lightweight: summary cards, growth trend, and recent users only.
- User records now expose activity fields such as last login, last seen activity, device/platform, Telegram ID, and referrer.
- Admin analytics include website traffic, daily traffic, recent user activity, and backend EA/session activity after the updated backend is deployed.
- Telegram ID is the canonical user identity in the dashboard layer: one Telegram ID maps to one user profile.
- Referral links are deterministic Telegram-based tokens in the form `TGREF-<telegram_id>`.
- The separate preregistration bot marks users as `pre_registered` by Telegram ID as soon as they start the bot from a referral link, and stores `telegram_username` plus `phone_number` if Telegram provides them.
- When that same Telegram user later authenticates in the app, the backend upgrades the same canonical profile to `registered` automatically.
- Direct app registrations without an ambassador referral are assigned to the owner profile by default.
- MT4 and MT5 are shown as child trading accounts under the same Telegram-owned profile instead of as separate top-level users.
- `paid` can be set from the dashboard when needed.

## What to upload

- Build output zips:
	- `..\\dist\\FlameBot-Windows.zip`
	- `..\\dist\\FlameBot-macOS.zip`

## Screenshots (optional)

To show the in-page preview gallery, add 3 screenshots here:

- `website/assets/screenshots/screen-1.png`
- `website/assets/screenshots/screen-2.png`
- `website/assets/screenshots/screen-3.png`

If any are missing, the gallery auto-hides those items (and hides the section if none exist).

Note: screenshots are shown on `/download/` (backed by `download/index.html`).

## Recommended hosting (simple)

1) Create a GitHub repository and push this project.
2) On GitHub: Releases -> New release
3) Upload `dist/FlameBot-Windows.zip` and `dist/FlameBot-macOS.zip` as release assets.
4) Use this URL format on the website:

`https://github.com/Emperorgeneral/FLAMEBOT/releases/latest/download/FlameBot-Windows.zip`

`https://github.com/Emperorgeneral/FLAMEBOT/releases/latest/download/FlameBot-macOS.zip`

Update the Windows download link in `index.html` to point to wherever you host that zip (GitHub Release asset URL, S3/R2 public URL, etc.).
>>>>>>> e2b4a4d (chore: initial website repository import)
