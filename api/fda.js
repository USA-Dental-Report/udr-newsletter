/**
 * /api/fda.js
 * Vercel serverless function — proxies FDA data fetches server-side
 * to avoid CORS issues when calling from the browser on the live domain.
 *
 * GET /api/fda?type=510k&from=YYYYMMDD&to=YYYYMMDD
 * GET /api/fda?type=alerts
 */

const DENTAL_TERMS = /dental|dent|oral|tooth|teeth|implant|crown|filling|composite|curing|autoclave|steriliz|endodontic|periodon|orthodon|cbct|intraoral|x-ray|radiograph/i;

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

function parseRssItems(xml) {
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return itemBlocks.map(block => ({
    title: extractTag(block, 'title'),
    link: extractTag(block, 'link'),
    pubDate: extractTag(block, 'pubDate'),
    description: extractTag(block, 'description'),
  }));
}

export default async function handler(req, res) {
  const { type, from, to } = req.query;

  try {
    if (type === '510k') {
      if (!from || !to) {
        return res.status(400).json({ error: 'Missing required "from" and "to" query params' });
      }
      const url = `https://api.fda.gov/device/510k.json?search=advisory_committee:"DE"+AND+decision_date:[${from}+TO+${to}]&limit=20&sort=decision_date:desc`;
      const response = await fetch(url);
      if (response.status === 404) {
        // openFDA returns 404 when a search matches zero records — not an error.
        return res.status(200).json({ results: [] });
      }
      if (!response.ok) {
        throw new Error(`FDA API ${response.status}`);
      }
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (type === 'alerts') {
      const ALERTS_RSS = 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch-safety-alerts/rss.xml';
      const response = await fetch(ALERTS_RSS);
      if (!response.ok) {
        throw new Error(`FDA RSS feed ${response.status}`);
      }
      const xml = await response.text();
      const allItems = parseRssItems(xml);

      const items = allItems.filter(item =>
        DENTAL_TERMS.test((item.title || '') + ' ' + (item.description || ''))
      );

      return res.status(200).json({ status: 'ok', items });
    }

    return res.status(400).json({ error: 'Invalid or missing "type" query param. Use "510k" or "alerts".' });

  } catch (err) {
    console.error('FDA fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch FDA data', detail: err.message });
  }
}
