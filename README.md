# cc-bridge

Bridge messaging platforms (Telegram, Discord) to Claude Code sessions via the Agent SDK.

## Quick Start

### Install via Homebrew (recommended)

```bash
brew tap misbahsy/tap
brew install cc-bridge
```

### Install via npm

```bash
npm install -g cc-bridge
```

### Run

```bash
# Setup
ccb setup

# Start
ccb start
```

## Requirements

- Node.js 20+
- Claude Code installed and authenticated (`claude --version`)
- Bot tokens for your platforms (Telegram, Discord, etc.)

## Features

- **Multi-platform**: Telegram, Discord
- **Session persistence**: Conversations resume across restarts
- **Named sessions**: Multiple parallel conversations per chat
- **Pairing security**: Approve new users via CLI
- **Webhook support**: Receive events from Gmail, GitHub, etc.
- **Agent routing**: Route different chats to different workspaces
- **Desktop app**: macOS menu bar app for easy management

## Desktop App (macOS)

A native macOS menu bar app for managing your bridge without the terminal.

### Features

- **Menu bar status**: See bridge status at a glance
- **One-click start/stop**: Control the bridge from the menu bar
- **Pairing approvals**: Approve or reject pairing requests with one click
- **Setup wizard**: Configure Telegram and Discord bots visually
- **Live logs**: View bridge logs in real-time

### Installation

**Via Homebrew (recommended):**
```bash
brew tap misbahsy/tap
brew install --cask ccb
```

**From source:**
```bash
cd desktop
npm install
npm run tauri build
# The app will be in desktop/src-tauri/target/release/bundle/macos/
```

### Development

```bash
cd desktop
npm install
npm run tauri dev
```

## CLI Commands

```bash
# Setup and status
ccb setup              # Interactive setup wizard
ccb start              # Start the bridge
ccb status             # Show current status

# Pairing management
ccb pairing list       # List pending pairing requests
ccb pairing approve <code>  # Approve a pairing code
ccb pairing revoke <chatKey>  # Revoke access

# Session management
ccb sessions list      # List all sessions
ccb sessions delete <id>  # Delete a session

# Allowlist management
ccb allowlist list     # List allowed chats
ccb allowlist add <chatKey>  # Add to allowlist
ccb allowlist remove <chatKey>  # Remove from allowlist

# Webhook management
ccb hooks list         # List configured webhooks
ccb hooks url <name>   # Show webhook URL
ccb hooks test <name>  # Test a webhook

# Channel testing
ccb channels test      # Test channel connections
```

## In-Chat Commands

Users can send commands directly in chat:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/new` | Start a fresh session |
| `/sessions` | List your sessions |
| `/session <name>` | Switch to named session |
| `/session new <name>` | Create named session |
| `/status` | Show session status |
| `/whoami` | Show your user info |
| `/agent` | List/switch agents |

## Configuration

Config file: `~/.ccb/config.json`

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "name": "Main Assistant",
        "workspace": "~/claude-workspace",
        "model": "claude-sonnet-4-5"
      }
    ]
  },
  "bindings": [
    { "agentId": "main" }
  ],
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "pairing",
      "allowFrom": []
    }
  }
}
```

### Environment Variables

Tokens can be specified as environment variables:

```bash
export TELEGRAM_BOT_TOKEN="your-token"
export DISCORD_BOT_TOKEN="your-token"
export WEBHOOK_TOKEN="your-secret"
```

### Security Policies

- **pairing** (recommended): New users receive a code to approve via CLI
- **allowlist**: Only pre-configured users can access
- **open**: Anyone can use the bot (not recommended)

## Webhooks

Enable webhooks to receive events from external services:

```json
{
  "hooks": {
    "enabled": true,
    "port": 38791,
    "token": "your-secret-token",
    "mappings": [
      {
        "match": { "path": "gmail" },
        "agentId": "main",
        "sessionKey": "hook:gmail:{{payload.messageId}}",
        "messageTemplate": "New email from {{payload.from}}...",
        "deliver": {
          "channel": "telegram",
          "to": "123456789"
        }
      }
    ]
  }
}
```

Test webhooks:

```bash
curl -X POST http://localhost:38791/hooks/gmail \
  -H "X-Webhook-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","subject":"Test"}'
```

## Architecture

```
Messaging Platforms        cc-bridge           Claude Code
(Telegram, Discord)  ──────►  Session Manager  ──────────►  SDK Sessions
                              │                              │
Webhooks (Gmail, etc) ──────► Router ──────────────────────► Your Skills
                              │                              │
                              └── Security (Pairing)         └── Your MCP Servers
```

The bridge spawns Claude Code sessions using the SDK, inheriting your:
- Skills (`~/.claude/skills/`)
- MCP servers
- Settings and permissions
- Max subscription authentication

---

## Terms of Service & Legal Compliance

**Please read before using this software.**

This bridge routes messages from messaging platforms through your personal Claude Code installation, which uses your Claude subscription authentication.

### Acceptable Use

- **Personal use only**: Using the bridge solely for your own messages across your own devices
- **Single user**: Only you (the subscription holder) send messages through the bridge
- **Private access**: No one else has access to your bridge instance
- **Pairing policy**: Set to "pairing" or "allowlist" and only approve your own accounts

### What to Avoid

- Setting `dmPolicy` to `"open"` which allows anyone to use your subscription
- Approving pairing codes for other people
- Sharing your bot tokens or webhook URLs with others
- Running this on a public server accessible to multiple users
- Using this for commercial purposes or business workflows
- Providing Claude access to others as a "service"

### For Multi-User or Commercial Use

If you need multi-user access or want to build applications on Claude:

1. **Use Anthropic's Official API**: https://www.anthropic.com/api
2. **Enterprise Plans**: Contact Anthropic for team/enterprise solutions
3. **Review Current Terms**:
   - Consumer Terms: https://www.anthropic.com/legal/consumer-terms
   - Acceptable Use Policy: https://www.anthropic.com/legal/aup
   - Commercial Terms: https://www.anthropic.com/legal/commercial-terms

### Disclaimer

By using this software, you acknowledge that:
- You are solely responsible for compliance with Anthropic's Terms of Service
- The authors of this software are not responsible for any ToS violations
- Your Anthropic account may be suspended or terminated for ToS violations
- This software is provided as-is with no warranties regarding compliance

When in doubt, use Anthropic's official API for programmatic access.

---

## License

MIT

This software is not affiliated with or endorsed by Anthropic. You are responsible for compliance with Anthropic's Terms of Service. The MIT license covers only this bridge software, not Claude or Claude Code.
