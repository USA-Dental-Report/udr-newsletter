/**
 * Cloudflare email worker — receives mail routed by Cloudflare Email
 * Routing (e.g. forwarded Feedly articles), parses it, and forwards a
 * lightweight summary to the udr-newsletter app's /api/inbox endpoint.
 *
 * Required Worker secrets/vars (see ../README.md for setup steps):
 *   VERCEL_INBOX_URL — e.g. https://tools.usadentalreport.com/api/inbox
 *   INBOX_SECRET     — shared secret, must match Vercel's INBOX_SECRET env var
 *   ALLOWED_FROM      — optional comma-separated list of sender addresses;
 *                       if set, mail from anyone else is silently dropped
 */

import PostalMime from 'postal-mime';

const SKIP_LINK_PATTERN = /unsubscribe|feedly\.com|list-manage|mailchimp|sendgrid|click\.|utm_|tracking/i;

function extractArticleLink(html, text) {
  if (html) {
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
    const good = hrefs.find(u => /^https?:\/\//i.test(u) && !SKIP_LINK_PATTERN.test(u));
    if (good) return good;
  }
  if (text) {
    const m = text.match(/https?:\/\/[^\s)>\]]+/);
    if (m && !SKIP_LINK_PATTERN.test(m[0])) return m[0];
  }
  return '';
}

function plainDescription(text, html) {
  const source = text || (html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
  return source.replace(/\s+/g, ' ').trim().slice(0, 2000);
}

export default {
  async email(message, env, ctx) {
    try {
      const allowed = (env.ALLOWED_FROM || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (allowed.length && !allowed.includes((message.from || '').toLowerCase())) {
        console.warn('Rejected email from unauthorized sender:', message.from);
        return;
      }

      const parsed = await PostalMime.parse(message.raw);
      const subject = parsed.subject || '(no subject)';
      const link = extractArticleLink(parsed.html, parsed.text);
      const description = plainDescription(parsed.text, parsed.html);

      const res = await fetch(env.VERCEL_INBOX_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-inbox-secret': env.INBOX_SECRET,
        },
        body: JSON.stringify({ subject, link, description, from: message.from }),
      });

      if (!res.ok) {
        console.error('Failed to forward emailed article:', res.status, await res.text());
      }
    } catch (err) {
      console.error('Email worker error:', err);
    }
  },
};
