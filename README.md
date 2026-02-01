# cc-bridge

Bridge messaging platforms (Telegram, Discord) to Claude Code sessions via the Agent SDK.

## Quick Start

```bash
# Install
npm install -g cc-bridge

# Setup
ccb setup

# Start
ccb start
```

## ⚠️ IMPORTANT: Terms of Service & Legal Compliance

**READ THIS CAREFULLY BEFORE USING THIS SOFTWARE**

This bridge routes messages from messaging platforms through your personal Claude Code installation, which uses your Claude subscription authentication. **This usage pattern may violate Anthropic's Terms of Service.**

### Potential ToS Violations

Using this bridge in certain ways may violate Anthropic's Consumer Terms of Service, including but not limited to:

1. **Account Sharing Prohibition**
   - ❌ **DO NOT** allow other people to send messages through your Claude subscription
   - ❌ **DO NOT** approve pairing requests from anyone other than yourself
   - ❌ **DO NOT** share your bridge access with friends, colleagues, or team members
   - ⚠️ Anthropic's Consumer Terms prohibit sharing account credentials or access with others

2. **Multi-User Access Restrictions**
   - ❌ **DO NOT** deploy this as a shared service for multiple users
   - ❌ **DO NOT** use this to provide Claude access to others through your subscription
   - ⚠️ Consumer subscriptions (Claude Pro/Max) are for individual personal use only

3. **Automated/Programmatic Usage**
   - ❌ **DO NOT** use this for commercial purposes or business operations
   - ❌ **DO NOT** create automated workflows that generate high volumes of requests
   - ❌ **DO NOT** build services on top of consumer subscriptions
   - ⚠️ Programmatic access should use Anthropic's official API, not consumer subscriptions

4. **Unauthorized Third-Party Applications**
   - ⚠️ While this uses the official Claude Agent SDK, routing through messaging platforms may be considered unauthorized usage
   - ⚠️ This creates an intermediary layer not explicitly authorized by Anthropic

### What IS Acceptable

✅ **Personal use only**: Using the bridge solely for your own messages across your own devices
✅ **Single user**: Only you (the subscription holder) send messages through the bridge
✅ **Private access**: No one else has access to your bridge instance
✅ **Pairing policy**: Set to "pairing" or "allowlist" and only approve your own accounts

### What to AVOID

❌ Setting `dmPolicy` to `"open"` - this allows anyone to use your subscription
❌ Approving pairing codes for other people
❌ Sharing your bot tokens or webhook URLs with others
❌ Running this on a public server accessible to multiple users
❌ Using this for commercial purposes or business workflows
❌ Providing Claude access to others as a "service"

### Proper Alternatives for Multi-User or Commercial Use

If you need multi-user access or want to build applications on Claude:

1. **Use Anthropic's Official API**: https://www.anthropic.com/api
   - Designed for programmatic and commercial use
   - Proper authentication, rate limiting, and billing
   - Supports building third-party applications

2. **Enterprise Plans**: Contact Anthropic for team/enterprise solutions

3. **Review Current Terms**: Always check the latest terms at:
   - Consumer Terms: https://www.anthropic.com/legal/consumer-terms
   - Acceptable Use Policy: https://www.anthropic.com/legal/aup
   - Commercial Terms: https://www.anthropic.com/legal/commercial-terms

### Disclaimer

**By using this software, you acknowledge that:**
- You are solely responsible for compliance with Anthropic's Terms of Service
- The authors of this software are not responsible for any ToS violations
- Your Anthropic account may be suspended or terminated for ToS violations
- This software is provided as-is with no warranties regarding compliance
- You should review Anthropic's current terms before using this software

**When in doubt, use Anthropic's official API for programmatic access.**

---

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

```bash
# From the repository
cd desktop
npm install
npm run tauri build

# The .dmg will be in desktop/src-tauri/target/release/bundle/dmg/
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
  - ⚠️ **ToS Compliance**: Only approve pairing codes for your own accounts/devices
- **allowlist**: Only pre-configured users can access
  - ⚠️ **ToS Compliance**: Only add your own chat IDs to the allowlist
- **open**: Anyone can use the bot (not recommended)
  - ❌ **ToS Violation**: This likely violates Anthropic's Terms of Service by allowing multi-user access through your subscription

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

## License

MIT

### Important Legal Notes

1. **This software is NOT affiliated with or endorsed by Anthropic**
2. **You are responsible for compliance with Anthropic's Terms of Service**
3. **The MIT license covers only this bridge software, not Claude or Claude Code**
4. **Use of Claude is subject to Anthropic's separate terms and conditions**
5. **Violation of Anthropic's ToS may result in account suspension or termination**

The authors and contributors of this software:
- Make no representations about ToS compliance
- Are not responsible for any consequences of ToS violations
- Recommend using Anthropic's official API for production/commercial use
- Provide this software for educational and personal experimental purposes only
