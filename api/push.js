// Push reminders. Subscriptions live in the Notion "Push Subscriptions" DB;
// reminder content derives from the Notion appointments + medications rows
// (the source of truth), so re-dating a row re-dates its reminders.
//
//   GET  /api/push?action=key                      -> { key } (VAPID public, passcode-gated)
//   POST /api/push  { subscription, member, device } -> store subscription (passcode-gated)
//   POST /api/push  { unsubscribe: endpoint }        -> remove subscription (passcode-gated)
//   GET  /api/push?action=cron&slot=morning|evening  -> send due reminders
//        (Vercel Cron; gated by CRON_SECRET bearer, slot inferred from UTC hour if omitted)
const webpush = require('web-push');
const { DB, checkPass, notion, rowFromPage, buildProperties } = require('../lib/ivf');

const TZ = 'America/Los_Angeles';

function configured(res) {
  const { VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    res.status(500).json({ error: 'push not configured (VAPID keys missing)' });
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:ryanaoufal@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
  return true;
}

// Local (Pacific) calendar date — reminders must follow the couple's day, not UTC.
function localToday() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return p.format(new Date()); // en-CA gives YYYY-MM-DD
}
function localHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
}
const dISO = (v) => (v ? String(v).slice(0, 10) : '');
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

async function listRows(dbKey) {
  const data = await notion('/databases/' + DB[dbKey] + '/query', {
    method: 'POST',
    body: JSON.stringify({ page_size: 100 }),
  });
  return (data.results || []).map(rowFromPage);
}

// A med row is "active" today if Start Date <= today <= End Date. Rows with no
// End Date get a safety window so a stale row can't nag forever.
function medActive(row, today) {
  const start = dISO(row['Start Date']);
  if (!start || start > today) return false;
  const end = dISO(row['End Date']) || addDays(start, row.Frequency && /daily/i.test(row.Frequency) ? 120 : 21);
  return today <= end;
}

function buildReminders(slot, today, appts, meds) {
  const lines = [];
  if (slot === 'morning') {
    for (const a of appts) {
      if (dISO(a.Date) === today) {
        const time = a.Date && String(a.Date).length > 10
          ? ' at ' + new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(a.Date))
          : '';
        lines.push((a.Appointment || 'Appointment') + time + (a.Prep ? ' — ' + a.Prep : ''));
      }
    }
    for (const m of meds) {
      if (medActive(m, today) && /\bam\b|morning/i.test(m.Frequency || '')) {
        lines.push((m.Medication || 'med') + (m.Dose ? ' ' + m.Dose : '') + ' — this morning');
      }
    }
    // OPK window: an appointment row named "Start OPK testing" anchors it
    const opk = appts.find((a) => /start opk/i.test(a.Appointment || ''));
    if (opk) {
      const s = dISO(opk.Date);
      if (s && today >= s && today <= addDays(s, 9)) lines.push('OPK test — first morning pee');
    }
  } else {
    for (const m of meds) {
      const f = m.Frequency || '';
      if (!medActive(m, today)) continue;
      if (/pm|night|evening/i.test(f)) {
        lines.push((m.Medication || 'med') + (m.Dose ? ' ' + m.Dose : '') + ' — tonight');
      } else if (/daily/i.test(f) && !/\bam\b|morning/i.test(f)) {
        lines.push((m.Medication || 'med') + (m.Dose ? ' ' + m.Dose : ''));
      }
    }
    for (const a of appts) {
      if (dISO(a.Date) === addDays(today, 1)) {
        lines.push('Tomorrow: ' + (a.Appointment || 'appointment') + (a.Prep ? ' — ' + a.Prep : ''));
      }
    }
  }
  return lines;
}

async function removeSub(pageId) {
  await notion('/pages/' + pageId, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
}

module.exports = async (req, res) => {
  const action = req.query.action || '';

  // --- cron: gated by CRON_SECRET, never by passcode --------------------------
  if (action === 'cron') {
    const auth = req.headers.authorization || '';
    if (!process.env.CRON_SECRET || auth !== 'Bearer ' + process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!configured(res)) return;
    const slot = req.query.slot || (localHour() < 12 ? 'morning' : 'evening');
    const today = localToday();
    try {
      const [appts, meds, subs] = await Promise.all([
        listRows('appointments'), listRows('medications'), listRows('pushSubs'),
      ]);
      const lines = buildReminders(slot, today, appts, meds);
      if (lines.length === 0 || subs.length === 0) {
        return res.status(200).json({ ok: true, slot, sent: 0, subs: subs.length, reminders: lines });
      }
      const payload = JSON.stringify({
        title: slot === 'morning' ? 'good morning — today' : 'tonight',
        body: lines.join('\n'),
        url: '/',
      });
      let sent = 0, pruned = 0;
      for (const s of subs) {
        const sub = {
          endpoint: s.Endpoint,
          keys: { p256dh: s.P256dh, auth: s.Auth },
        };
        try {
          await webpush.sendNotification(sub, payload);
          sent++;
        } catch (err) {
          // 404/410 = subscription is dead — prune it so we stop trying
          if (err.statusCode === 404 || err.statusCode === 410) {
            await removeSub(s.id).catch(() => {});
            pruned++;
          }
        }
      }
      return res.status(200).json({ ok: true, slot, sent, pruned, reminders: lines });
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  // --- everything else: passcode-gated (same as the rest of the app) ----------
  if (!checkPass(req, res)) return;

  if (req.method === 'GET' && action === 'key') {
    if (!process.env.VAPID_PUBLIC) return res.status(500).json({ error: 'push not configured' });
    return res.status(200).json({ key: process.env.VAPID_PUBLIC });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    try {
      if (body.unsubscribe) {
        const subs = await listRows('pushSubs');
        const hit = subs.find((s) => s.Endpoint === body.unsubscribe);
        if (hit) await removeSub(hit.id);
        return res.status(200).json({ ok: true, removed: Boolean(hit) });
      }
      const sub = body.subscription;
      if (!sub || !sub.endpoint || !sub.keys) return res.status(400).json({ error: 'missing subscription' });
      // one row per endpoint — re-subscribing the same device replaces it
      const subs = await listRows('pushSubs');
      const dup = subs.find((s) => s.Endpoint === sub.endpoint);
      if (dup) await removeSub(dup.id);
      await notion('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { database_id: DB.pushSubs },
          properties: buildProperties('pushSubs', {
            Device: body.device || 'device',
            Endpoint: sub.endpoint,
            P256dh: sub.keys.p256dh,
            Auth: sub.keys.auth,
            Member: body.member || 'Both',
          }),
        }),
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
};
