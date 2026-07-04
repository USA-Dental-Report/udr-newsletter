/**
 * /api/fda.js
 * Vercel serverless function — proxies FDA data fetches server-side
 * to avoid CORS issues when calling from the browser on the live domain.
 *
 * GET /api/fda?type=510k&from=YYYYMMDD&to=YYYYMMDD
 * GET /api/fda?type=alerts
 */

const DENTAL_TERMS = /dental|dent|oral|tooth|teeth|implant|crown|filling|composite|curing|autoclave|steriliz|endodontic|periodon|orthodon|cbct|intraoral|x-ray|radiograph/i;

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
      // Previously scraped www.fda.gov's MedWatch RSS page, but that URL now
      // 404s (FDA restructured the site). Use the structured openFDA device
      // enforcement (recalls) API instead — same api.fda.gov domain the
      // 510(k) source already relies on, with no RSS-page bot protection or
      // URL-rot risk.
      const url = 'https://api.fda.gov/device/enforcement.json?limit=100&sort=report_date:desc';
      const response = await fetch(url);
      if (response.status === 404) {
        // openFDA returns 404 when a search matches zero records — not an error.
        return res.status(200).json({ status: 'ok', items: [] });
      }
      if (!response.ok) {
        throw new Error(`FDA API ${response.status}`);
      }
      const data = await response.json();

      const allItems = (data.results || []).map(r => ({
        title: `${r.recalling_firm ? r.recalling_firm + ': ' : ''}${r.product_description || 'Device recall'}`.slice(0, 200),
        link: 'https://www.fda.gov/medical-devices/medical-device-recalls',
        pubDate: r.report_date ? `${r.report_date.slice(0,4)}-${r.report_date.slice(4,6)}-${r.report_date.slice(6,8)}` : '',
        description: r.reason_for_recall || '',
      }));

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
