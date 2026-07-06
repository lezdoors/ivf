// Validates the passcode (used on login) and reports which integrations are live.
// Never returns any secret value — only booleans.
import { checkPass } from '../lib/ivf';

export default async function handler(req: any, res: any) {
  if (!checkPass(req, res)) return;
  return res.status(200).json({
    ok: true,
    notion: Boolean(process.env.NOTION_TOKEN),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
    agent: true,
  });
}
