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
│   ├── fda.js           # Serverless function — FDA 510(k) + MedWatch alerts
│   └── feed.js          # Serverless function — fetches/parses any RSS/Atom feed
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

---

## Updating

After making changes to `index.html` or `api/generate.js`:

```bash
vercel --prod
```

If using GitHub, push to main and Vercel auto-deploys.
