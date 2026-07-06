// Notion data proxy. Gated by the shared passcode; token stays server-side.
//   GET    /api/notion?db=journal[&sort=Date&dir=desc]   -> list rows
//   POST   /api/notion?db=journal   body { fields }        -> create row
//   PATCH  /api/notion?id=<pageId>&db=journal  body { fields } -> update row
const { DB, checkPass, notion, rowFromPage, buildProperties } = require('../lib/ivf');

module.exports = async (req, res) => {
  if (!checkPass(req, res)) return;
  const dbKey = req.query.db || '';
  try {
    if (req.method === 'GET') {
      const dbId = DB[dbKey];
      if (!dbId) return res.status(400).json({ error: 'unknown db "' + dbKey + '"' });
      const sorts = req.query.sort
        ? [{ property: String(req.query.sort), direction: req.query.dir === 'asc' ? 'ascending' : 'descending' }]
        : undefined;
      const data = await notion('/databases/' + dbId + '/query', {
        method: 'POST',
        body: JSON.stringify({ page_size: 100, ...(sorts ? { sorts } : {}) }),
      });
      return res.status(200).json({ rows: (data.results || []).map(rowFromPage) });
    }
    if (req.method === 'POST') {
      const dbId = DB[dbKey];
      if (!dbId) return res.status(400).json({ error: 'unknown db "' + dbKey + '"' });
      const fields = (req.body && req.body.fields) || {};
      const page = await notion('/pages', {
        method: 'POST',
        body: JSON.stringify({ parent: { database_id: dbId }, properties: buildProperties(dbKey, fields) }),
      });
      return res.status(200).json({ row: rowFromPage(page) });
    }
    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'missing id' });
      const fields = (req.body && req.body.fields) || {};
      const page = await notion('/pages/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ properties: buildProperties(dbKey, fields) }),
      });
      return res.status(200).json({ row: rowFromPage(page) });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
};
