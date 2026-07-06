// Validates the passcode (used on login) and reports which integrations are live.
const { checkPass } = require('../lib/ivf');

module.exports = (req, res) => {
  if (!checkPass(req, res)) return;
  res.status(200).json({
    ok: true,
    notion: Boolean(process.env.NOTION_TOKEN),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
    agent: true,
  });
};
