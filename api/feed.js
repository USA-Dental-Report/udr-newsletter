/**
 * /api/feed.js
 * Vercel serverless function — proxies arbitrary user-added RSS/Atom
 * feed fetches server-side, avoiding both browser CORS restrictions
 * and the free rss2json.com proxy (rate-limited / unreliable, and the
 * reason the FDA alerts feed was moved off it — see api/fda.js).
 *
 * GET /api/feed?url=<encoded feed url>
 */

const PRIVATE_HOST_RE = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1\]?|\[?fc|\[?fd|\[?fe80)/i;

function decodeXmlEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

function extractAtomLink(block) {
  const match = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

function parseFeedItems(xml) {
  const rssBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi);
  if (rssBlocks && rssBlocks.length) {
    return rssBlocks.map(block => ({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link') || extractAtomLink(block),
      pubDate: extractTag(block, 'pubDate') || extractTag(block, 'dc:date'),
      description: extractTag(block, 'description') || extractTag(block, 'content:encoded'),
    }));
  }
  const atomBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return atomBlocks.map(block => ({
    title: extractTag(block, 'title'),
    link: extractAtomLink(block),
    pubDate: extractTag(block, 'published') || extractTag(block, 'updated'),
    description: extractTag(block, 'summary') || extractTag(block, 'content'),
  }));
}

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ status: 'error', message: 'Missing required "url" query param' });
  }

  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).json({ status: 'error', message: 'Invalid feed URL' });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:' || PRIVATE_HOST_RE.test(target.hostname)) {
    return res.status(400).json({ status: 'error', message: 'Invalid feed URL' });
  }

  try {
    const response = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    if (!response.ok) {
      throw new Error(`Feed responded ${response.status}`);
    }
    const xml = await response.text();
    const items = parseFeedItems(xml);
    return res.status(200).json({ status: 'ok', items });
  } catch (err) {
    console.error('Feed fetch error:', url, err.message);
    return res.status(502).json({ status: 'error', message: err.message });
  }
}
