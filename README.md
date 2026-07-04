# USA Dental Report — Newsletter Generator

Weekly content generation tool for USA Dental Report. Pulls from RSS feeds + FDA APIs, lets you curate the week's content, then generates:

- LinkedIn newsletter article
- Beehiiv email newsletter
- Substack newsletter
- 5 LinkedIn posts (Mon–Fri) with Buffer links

## Project structure

```
udr-newsletter/
├── index.html          # The app
├── api/
│   ├── generate.js      # Vercel serverless function (holds Anthropic API key)
│   ├── fda.js           # Serverless function — FDA 510(k) + device recalls
│   ├── feed.js          # Serverless function — fetches/parses any RSS/Atom feed
│   └── inbox.js         # Serverless function — stores/serves emailed-in articles
├── cloudflare-worker/   # Optional: receives emailed articles, forwards to api/inbox.js
├── vercel.json         # Routing config
├── .env.example        # Environment variable template
└── .gitignore
```

---

## Built-in sources

These are hardcoded into the app (locked, non-removable in the UI) and are always fetched on load/refresh, in addition to any feeds you add yourself via the **+** button:

| Source | Type | URL |
|---|---|---|
| ADA News | News | `http://www.ada.org/en/ada-news-rss` |
| Dental Podcast | Podcast | `https://dentalpodcast.org/feed/?post_type=podcast-episode` |
| USA Dental Report | News | `https://rss.beehiiv.com/feeds/tuw0IXKQhc.xml` |
| Dental 510(k) Clearances | FDA | openFDA API — `advisory_committee: Dental` |
| CDRH Safety Alerts | FDA | openFDA API — `device/enforcement` recalls, filtered to dental terms |

Sources added via the UI are stored in the browser's `localStorage`, not server-side — they won't carry over across devices/browsers or between Vercel preview deployment URLs. To add or remove a built-in source permanently, edit the `BUILTIN_FEEDS` array in `index.html` (or the FDA-specific logic in `api/fda.js`) and redeploy.

---

## Deploy to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Clone / copy this project

If you're using GitHub (recommended):
```bash
git init
git add .
git commit -m "initial"
gh repo create udr-newsletter --private
git push -u origin main
```

Or just deploy directly from this folder without Git.

### 3. Add your Anthropic API key

Copy the example env file:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your key:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 4. Deploy

```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Choose your account
- Link to existing project? **N**
- Project name: `udr-newsletter` (or whatever you want)
- Directory: `.` (current folder)
- Override settings? **N**

Vercel gives you a URL like `udr-newsletter-abc123.vercel.app`.

### 5. Add environment variable in Vercel dashboard

Go to: **vercel.com → your project → Settings → Environment Variables**

Add:
- Key: `ANTHROPIC_API_KEY`
- Value: your Anthropic API key
- Environment: Production, Preview, Development (check all three)

Then redeploy:
```bash
vercel --prod
```

### 6. Set a custom domain (optional)

In Vercel dashboard → your project → Settings → Domains

Add: `tools.usadentalreport.com` (or whatever subdomain you want)

Then add a CNAME record in your DNS:
```
tools.usadentalreport.com → cname.vercel-dns.com
```

---

## Emailing articles in (optional)

If you read dental news in Feedly (or any RSS reader / email client), you can forward an article and it'll show up in the app under **Emailed articles**, selectable alongside the RSS/FDA sources.

This works via: your inbox address → **Cloudflare Email Routing** → a small **Cloudflare Worker** (`cloudflare-worker/`) that parses the email and POSTs it to `/api/inbox` → stored in **Upstash Redis** (via Vercel's Storage marketplace) → read by the app.

**Prerequisite:** the domain you want the inbox address on (e.g. `usadentalreport.com`) must use Cloudflare's nameservers — Email Routing works at the DNS zone level, not just a single CNAME record. If your domain's DNS lives elsewhere, either move it to Cloudflare or use a subdomain you're willing to delegate to Cloudflare.

### 1. Add Redis storage in Vercel

Vercel project → **Storage** tab → **Marketplace Database Providers** → **Upstash for Redis** → create and connect it to this project. Vercel will inject `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, depending on integration version) into your project's environment automatically — `@upstash/redis`'s `Redis.fromEnv()` picks either up.

### 2. Set a shared secret

In Vercel → Settings → Environment Variables, add:
- `INBOX_SECRET` — any long random string (e.g. `openssl rand -hex 32`)

This is what authenticates the Cloudflare Worker's write to `/api/inbox` — the worker can't present your site's Basic Auth credentials, so `middleware.js` carves out an exception for that one route+method and `api/inbox.js` checks this secret instead. Redeploy after adding it.

### 3. Deploy the Cloudflare Worker

```bash
cd cloudflare-worker
npm install
npx wrangler login          # first time only
npx wrangler secret put INBOX_SECRET        # paste the same value as step 2
npx wrangler secret put VERCEL_INBOX_URL    # e.g. https://tools.usadentalreport.com/api/inbox
npx wrangler secret put ALLOWED_FROM        # optional: your email address, to reject mail from anyone else
npx wrangler deploy
```

### 4. Route an address to the Worker

Cloudflare dashboard → your domain → **Email Routing** → enable it (if not already) → **Create address** → pick something like `clips@usadentalreport.com` → **Action: Send to a Worker** → select `udr-newsletter-inbox`.

### 5. Use it

In Feedly, use the article's **Forward/Email** share action and send it to that address. Within a minute or two it'll appear under **Emailed articles** in the sidebar, pre-selected and ready to include in the week's newsletter. Use the **×** on an item or **Clear** in the sidebar to remove entries once you're done with them.

---

## Local development

```bash
# Install Vercel CLI
npm i -g vercel

# Run locally (reads .env.local automatically)
vercel dev
```

Opens at `http://localhost:3000`.

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key from console.anthropic.com |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | Optional — gates the whole site behind HTTP Basic Auth |
| `INBOX_SECRET` | Optional — required only if using the "Emailing articles in" feature below |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) | Auto-set by Vercel when you connect an Upstash Redis database; required for the emailed-articles feature |

---

## Updating

After making changes to `index.html` or `api/generate.js`:

```bash
vercel --prod
```

If using GitHub, push to main and Vercel auto-deploys.
