// Shared helpers for the IVF app serverless functions.
// Files prefixed with "_" are treated as helpers by Vercel, not routes.

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';

// Friendly key -> Notion database id (from the "IVF Journey — Ryan & Nina" hub).
export const DB: Record<string, string> = {
  tasks: '2ec839592c154855940850e63c36f7a7',
  insuranceAuth: '612ac0113b5048d78b32e1ed5927133e',
  medications: '5dc3277550cb4dc0b403a66f20f561d7',
  labResults: '0d0b6357700747b695b31b1345f8d757',
  appointments: '1c294fb8ab6349928d0050442a70888c',
  embryos: '0b5aa47b1f234c4195257fcf36be47b8',
  financial: 'e76b004d35f34b07b6abeabe2c5583fd',
  documents: '1117686a273f488d94476d738da05cf6',
  monitoring: '067008a4e9414197a834a2c2e39292cc',
  journal: '175958d45c814a45b721ee631d842e14',
  contacts: '803d7c73ce28426c8b31437c044fa2c7',
  appConfig: '4e2ae8e32003492480ae18a8fbd1198a',
  copilotQueue: '7fb3546e395a4aacadc55f693aa5cbca',
};

export const HUB_PAGE_ID = '38ec86c3ddce815d8572cf075ce25e79';

// Field -> Notion type per database, so the frontend can send plain values.
export const SCHEMAS: Record<string, Record<string, string>> = {
  journal: {
    Entry: 'title', Date: 'date', Author: 'select', Feeling: 'select',
    Mood: 'select', Symptoms: 'rich_text', Notes: 'rich_text',
  },
  monitoring: {
    Scan: 'title', Date: 'date', 'Cycle Day': 'number', E2: 'number', LH: 'number',
    P4: 'number', 'Lining (mm)': 'number', 'Lead Follicle (mm)': 'number',
    'Follicles Left': 'number', 'Follicles Right': 'number', 'Next Scan': 'date',
    Notes: 'rich_text',
  },
  appointments: {
    Appointment: 'title', Date: 'date', Clinic: 'rich_text', Provider: 'rich_text',
    Purpose: 'rich_text', Prep: 'rich_text', 'Questions to Ask': 'rich_text',
    Results: 'rich_text', 'Follow-up': 'rich_text',
  },
  medications: {
    Medication: 'title', Dose: 'rich_text', Frequency: 'rich_text', Purpose: 'rich_text',
    'Insurance Status': 'select', 'Qty Left': 'number', Refills: 'number',
    'Start Date': 'date', 'End Date': 'date', Notes: 'rich_text',
  },
  copilotQueue: {
    'Id': 'title', Question: 'rich_text', Answer: 'rich_text',
    Conversation: 'rich_text', Status: 'select',
  },
};

// Build a Notion properties object from plain { field: value } using the schema.
export function buildProperties(dbKey: string, fields: Record<string, any>): any {
  const schema = SCHEMAS[dbKey] || {};
  const out: any = {};
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const type = schema[field] || 'rich_text';
    out[field] = writeProp(type, value);
  }
  return out;
}

// --- auth --------------------------------------------------------------------
// Every request must carry the shared passcode. Without it the Notion token is
// never used, so the data stays behind the gate even though the URL is public.
export function checkPass(req: any, res: any): boolean {
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    res.status(500).json({ error: 'APP_PASSCODE not configured' });
    return false;
  }
  const given = req.headers['x-app-pass'];
  if (given !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

// --- notion rest -------------------------------------------------------------
export async function notion(path: string, init: RequestInit = {}): Promise<any> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN not configured');
  const r = await fetch(`${NOTION_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`notion ${r.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// Read a Notion property object into a plain value.
export function readProp(prop: any): any {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return (prop.title || []).map((t: any) => t.plain_text).join('');
    case 'rich_text':
      return (prop.rich_text || []).map((t: any) => t.plain_text).join('');
    case 'select':
      return prop.select?.name ?? null;
    case 'multi_select':
      return (prop.multi_select || []).map((s: any) => s.name);
    case 'number':
      return prop.number;
    case 'checkbox':
      return prop.checkbox;
    case 'date':
      return prop.date?.start ?? null;
    case 'url':
      return prop.url;
    case 'email':
      return prop.email;
    case 'phone_number':
      return prop.phone_number;
    default:
      return null;
  }
}

export function rowFromPage(page: any): Record<string, any> {
  const out: Record<string, any> = { id: page.id, createdTime: page.created_time };
  for (const [name, prop] of Object.entries(page.properties || {})) {
    out[name] = readProp(prop);
  }
  return out;
}

// Build a Notion property value from a plain value + declared type.
export function writeProp(type: string, value: any): any {
  switch (type) {
    case 'title':
      return { title: [{ text: { content: String(value ?? '') } }] };
    case 'rich_text':
      return { rich_text: [{ text: { content: String(value ?? '') } }] };
    case 'select':
      return value ? { select: { name: String(value) } } : { select: null };
    case 'number':
      return { number: value === '' || value == null ? null : Number(value) };
    case 'checkbox':
      return { checkbox: Boolean(value) };
    case 'date':
      return value ? { date: { start: String(value) } } : { date: null };
    default:
      return { rich_text: [{ text: { content: String(value ?? '') } }] };
  }
}

// --- slack -------------------------------------------------------------------
export async function slack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return r.ok;
}

export function json(res: any, code: number, body: any) {
  res.status(code).json(body);
}
