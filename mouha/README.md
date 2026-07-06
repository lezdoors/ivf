# Mouha IVF agent — deploy

The worker polls the Notion **Copilot Queue**. When the app asks a question it
drops a `Pending` row; Mouha picks it up, runs gpt-4o-mini with tools (read the
databases, add/update rows, send Slack), writes the `Answer`, and marks it `Done`.

## One-time setup (on the VPS)

```bash
# from your Mac, copy the worker up
scp -r mouha root@72.60.68.226:~/ivf-agent

ssh root@72.60.68.226
cd ~/ivf-agent
cp .env.example .env && nano .env      # fill NOTION_TOKEN, OPENAI_API_KEY, SLACK_WEBHOOK_URL
python3 --version                      # needs 3.7+ (stdlib only, no pip installs)
```

## Run it 24/7 (systemd)

```bash
cat >/etc/systemd/system/ivf-agent.service <<'EOF'
[Unit]
Description=Mouha IVF agent
After=network.target

[Service]
WorkingDirectory=/root/ivf-agent
ExecStart=/usr/bin/python3 /root/ivf-agent/ivf_agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now ivf-agent
journalctl -u ivf-agent -f          # watch it work
```

Or quick test in a screen: `screen -S ivf python3 ivf_agent.py`

## Test
In the app's **agent** tab: "what's my next appointment?" → within a few
seconds the answer appears (and the Copilot Queue row flips Pending→Working→Done).
