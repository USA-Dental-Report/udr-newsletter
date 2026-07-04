/**
 * /api/inbox.js
 * Vercel serverless function — stores articles emailed in (e.g. forwarded
 * from Feedly) via the Cloudflare email worker, and serves them back to
 * the app so they can be selected alongside the RSS/FDA sources.
 *
 * GET    /api/inbox            → { status: 'ok', items: [...] }
 * POST   /api/inbox             (from the Cloudflare worker only, authenticated
 *                                via the x-inbox-secret header — see middleware.js)
 * DELETE /api/inbox?id=<id>    → remove one item
 * DELETE /api/inbox?all=1      → remove everything
 */

import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

const HASH_KEY = 'inbox:items';
const MAX_ITEMS = 200;

function getRedis() {
  return Redis.fromEnv();
}

export default async function handler(req, res) {
  let redis;
  try {
    redis = getRedis();
  } catch {
    return res.status(500).json({ error: 'Redis is not configured (missing KV/Upstash env vars)' });
  }

  if (req.method === 'GET') {
    try {
      const all = await redis.hgetall(HASH_KEY) || {};
      const items = Object.values(all)
        .map(v => (typeof v === 'string' ? JSON.parse(v) : v))
        .sort((a, b) => (b.receivedAt || '').localeCompare(a.receivedAt || ''));
      return res.status(200).json({ status: 'ok', items });
    } catch (err) {
      console.error('Inbox list error:', err);
      return res.status(500).json({ error: 'Failed to load inbox', detail: err.message });
    }
  }

  if (req.method === 'POST') {
    const secret = req.headers['x-inbox-secret'];
    if (!process.env.INBOX_SECRET || secret !== process.env.INBOX_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subject, link, description, from } = req.body || {};
    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({ error: 'Missing "subject"' });
    }

    try {
      const id = 'email_' + randomUUID();
      const item = {
        id,
        title: subject.slice(0, 300),
        link: typeof link === 'string' ? link.slice(0, 2000) : '',
        description: typeof description === 'string' ? description.slice(0, 2000) : '',
        from: typeof from === 'string' ? from.slice(0, 300) : '',
        receivedAt: new Date().toISOString(),
      };
      await redis.hset(HASH_KEY, { [id]: JSON.stringify(item) });

      // Cap total stored items so the inbox can't grow unbounded.
      const all = await redis.hgetall(HASH_KEY) || {};
      const keys = Object.keys(all);
      if (keys.length > MAX_ITEMS) {
        const parsed = keys
          .map(k => ({ key: k, receivedAt: (typeof all[k] === 'string' ? JSON.parse(all[k]) : all[k]).receivedAt || '' }))
          .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
        const excess = parsed.slice(0, keys.length - MAX_ITEMS).map(p => p.key);
        if (excess.length) await redis.hdel(HASH_KEY, ...excess);
      }

      return res.status(200).json({ status: 'ok', id });
    } catch (err) {
      console.error('Inbox store error:', err);
      return res.status(500).json({ error: 'Failed to store item', detail: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      if (req.query.all === '1') {
        await redis.del(HASH_KEY);
        return res.status(200).json({ status: 'ok' });
      }
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Missing "id" query param' });
      await redis.hdel(HASH_KEY, id);
      return res.status(200).json({ status: 'ok' });
    } catch (err) {
      console.error('Inbox delete error:', err);
      return res.status(500).json({ error: 'Failed to delete item', detail: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
