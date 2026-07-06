// Agent bridge. The browser drops a row in the Notion "Copilot Queue" and polls
// for the answer. Mouha (the VPS worker) processes Pending rows and writes Done.
//   POST /api/ask   body { question, author }  -> { id }
//   GET  /api/ask?id=<pageId>                  -> { status, answer }
const { DB, checkPass, notion, rowFromPage, buildProperties } = require('../lib/ivf');

module.exports = async (req, res) => {
  if (!checkPass(req, res)) return;
  try {
    if (req.method === 'POST') {
      const question = String((req.body && req.body.question) || '').trim();
      const author = String((req.body && req.body.author) || 'Both');
      if (!question) return res.status(400).json({ error: 'empty question' });
      const stamp = new Date().toISOString();
      const page = await notion('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { database_id: DB.copilotQueue },
          properties: buildProperties('copilotQueue', {
            Id: author + ' · ' + stamp,
            Question: question,
            Status: 'Pending',
          }),
        }),
      });
      return res.status(200).json({ id: page.id });
    }
    if (req.method === 'GET') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'missing id' });
      const page = await notion('/pages/' + id);
      const row = rowFromPage(page);
      return res.status(200).json({ status: row.Status, answer: row.Answer, question: row.Question });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
};
