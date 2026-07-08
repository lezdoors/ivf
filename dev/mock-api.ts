// Dev-only mock of the /api/* serverless functions, so `pnpm dev` runs the full
// app with realistic data and NO secrets (Notion token / passcode). Never bundled
// into the production build — it's a Vite dev-server middleware only.
import type { Plugin } from 'vite';

type Row = Record<string, any> & { id: string; createdTime: string };
let seq = 100;
const uid = () => `mock-${++seq}`;

const store: Record<string, Row[]> = {
  monitoring: [
    { id: uid(), createdTime: '', Scan: 'baseline', Date: '2026-07-05', 'Cycle Day': 2, E2: 38, LH: 4.1, P4: 0.4, 'Lining (mm)': 3.2, 'Lead Follicle (mm)': 6, 'Follicles Left': 7, 'Follicles Right': 6 },
    { id: uid(), createdTime: '', Scan: 'scan', Date: '2026-07-08', 'Cycle Day': 5, E2: 210, LH: 3.2, P4: 0.5, 'Lining (mm)': 5.1, 'Lead Follicle (mm)': 10, 'Follicles Left': 8, 'Follicles Right': 7 },
    { id: uid(), createdTime: '', Scan: 'scan', Date: '2026-07-10', 'Cycle Day': 7, E2: 640, LH: 2.9, P4: 0.6, 'Lining (mm)': 7.0, 'Lead Follicle (mm)': 13, 'Follicles Left': 9, 'Follicles Right': 8 },
    { id: uid(), createdTime: '', Scan: 'scan', Date: '2026-07-12', 'Cycle Day': 9, E2: 1480, LH: 2.4, P4: 0.8, 'Lining (mm)': 8.4, 'Lead Follicle (mm)': 16, 'Follicles Left': 9, 'Follicles Right': 8 },
    { id: uid(), createdTime: '', Scan: 'scan', Date: '2026-07-14', 'Cycle Day': 11, E2: 2600, LH: 2.1, P4: 1.1, 'Lining (mm)': 9.6, 'Lead Follicle (mm)': 19, 'Follicles Left': 9, 'Follicles Right': 8 },
  ],
  appointments: [
    { id: uid(), createdTime: '', Appointment: 'Baseline ultrasound', Date: '2026-07-05', Clinic: 'Stanford Fertility', Provider: 'Dr. Amin Milki', Prep: 'full bladder' },
    { id: uid(), createdTime: '', Appointment: 'Egg retrieval', Date: '2026-07-16', Clinic: 'Stanford Fertility', Provider: 'Dr. Amin Milki', Prep: 'fast from midnight; arrange a ride home' },
  ],
  medications: [
    { id: uid(), createdTime: '', Medication: 'Gonal-F', Dose: '225 IU', Frequency: 'nightly', Purpose: 'stimulation', 'Insurance Status': 'Covered', 'Qty Left': 6 },
    { id: uid(), createdTime: '', Medication: 'Menopur', Dose: '150 IU', Frequency: 'nightly', Purpose: 'stimulation', 'Insurance Status': 'Preauth needed', 'Qty Left': 5 },
    { id: uid(), createdTime: '', Medication: 'Cetrotide', Dose: '0.25 mg', Frequency: 'morning', Purpose: 'prevent early ovulation', 'Insurance Status': 'Covered', 'Qty Left': 4 },
  ],
  journal: [
    { id: uid(), createdTime: '', Entry: 'first shots done', Date: '2026-07-05', Author: 'Nina', Feeling: 'Hopeful', Mood: 'Okay', Symptoms: 'mild bloating', Notes: 'nervous but ready.' },
    { id: uid(), createdTime: '', Entry: 'we can do this', Date: '2026-07-08', Author: 'Both', Feeling: 'Grateful', Mood: 'Good', Symptoms: '', Notes: 'talked it through together.' },
  ],
};

function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c: any) => (raw += c));
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}

export function mockApi(): Plugin {
  return {
    name: 'nina-mock-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const u = req.url || '';
        if (!u.startsWith('/api/')) return next();
        const url = new URL(u, 'http://localhost');
        const send = (code: number, obj: any) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
        };
        // dev auth: any non-empty passcode works
        if (!req.headers['x-app-pass']) return send(401, { error: 'unauthorized' });

        const path = url.pathname.replace('/api/', '');
        if (path === 'config') return send(200, { ok: true, notion: true, slack: false, agent: true });

        if (path === 'ask') {
          if (req.method === 'POST') return send(200, { id: uid() });
          return send(200, { status: 'Done', answer: '(dev mock) I would answer that and log it to Notion. Try the real deploy for live answers.' });
        }

        if (path === 'notion') {
          const db = url.searchParams.get('db') || '';
          const list = store[db] || (store[db] = []);
          if (req.method === 'GET') {
            const sort = url.searchParams.get('sort');
            const dir = url.searchParams.get('dir') === 'asc' ? 1 : -1;
            let rows = [...list];
            if (sort) rows.sort((a, b) => (String(a[sort] ?? '') < String(b[sort] ?? '') ? -1 : 1) * dir);
            return send(200, { rows });
          }
          const body = await readBody(req);
          if (req.method === 'POST') {
            const row: Row = { id: uid(), createdTime: new Date().toISOString(), ...(body.fields || {}) };
            list.unshift(row);
            return send(200, { row });
          }
          if (req.method === 'PATCH') {
            const id = url.searchParams.get('id');
            const row = list.find((r) => r.id === id);
            if (row) Object.assign(row, body.fields || {});
            return send(200, { row: row || {} });
          }
        }
        return send(404, { error: 'mock: not found' });
      });
    },
  };
}
