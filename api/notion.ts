// Notion data proxy. All access is gated by the shared passcode; the Notion
// token lives only in server env and is never exposed to the browser.
//
//   GET    /api/notion?db=journal[&sort=Date&dir=desc]   -> list rows
//   POST   /api/notion?db=journal   body { fields: {...} }  -> create row
//   PATCH  /api/notion?id=<pageId>&db=journal  body { fields } -> update row
import { DB, checkPass, notion, rowFromPage, buildProperties } from '../lib/ivf';

export default async function handler(req: any, res: any) {
  if (!checkPass(req, res)) return;

  const dbKey = (req.query.db || '') as string;
  try {
    if (req.method === 'GET') {
      const dbId = DB[dbKey];
      if (!dbId) return res.status(400).json({ error: `unknown db "${dbKey}"` });
      const sorts = req.query.sort
        ? [{ property: String(req.query.sort), direction: req.query.dir === 'asc' ? 'ascending' : 'descending' }]
        : undefined;
      const data = await notion(`/databases/${dbId}/query`, {
        method: 'POST',
        body: JSON.stringify({ page_size: 100, ...(sorts ? { sorts } : {}) }),
      });
      return res.status(200).json({ rows: (data.results || []).map(rowFromPage) });
    }

    if (req.method === 'POST') {
      const dbId = DB[dbKey];
      if (!dbId) return res.status(400).json({ error: `unknown db "${dbKey}"` });
      const fields = (req.body?.fields || {}) as Record<string, any>;
      const page = await notion('/pages', {
        method: 'POST',
        body: JSON.stringify({ parent: { database_id: dbId }, properties: buildProperties(dbKey, fields) }),
      });
      return res.status(200).json({ row: rowFromPage(page) });
    }

    if (req.method === 'PATCH') {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'missing id' });
      const fields = (req.body?.fields || {}) as Record<string, any>;
      const page = await notion(`/pages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: buildProperties(dbKey, fields) }),
      });
      return res.status(200).json({ row: rowFromPage(page) });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err: any) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
