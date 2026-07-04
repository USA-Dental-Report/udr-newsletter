/**
 * /api/fda.js
 * Vercel serverless function — proxies FDA data fetches server-side
 * to avoid CORS issues when calling from the browser on the live domain.
 *
 * GET /api/fda?type=510k&from=YYYYMMDD&to=YYYYMMDD
 * GET /api/fda?type=alerts
 */

const DENTAL_TERMS = /dental|dent|oral|tooth|teeth|implant|crown|filling|composite|curing|autoclave|steriliz|endodontic|periodon|orthodon|cbct|intraoral|x-ray|radiograph/i;

const NAMED_ENTITIES = {
  lt: '<', gt: '>', amp: '&', quot: '"', apos: "'",
  nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®', trade: '™',
};

function decodeXmlEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const code = entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      const value = NAMED_ENTITIES[entity.toLowerCase()];
      return value === undefined ? match : value;
    });
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
      // www.fda.gov sits behind bot protection that 403s requests without
      // browser-like headers, unlike the api.fda.gov open-data endpoints.
      const response = await fetch(ALERTS_RSS, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
      });
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
