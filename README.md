# cc-bridge

Bridge messaging platforms (Telegram, Discord) to Claude Code sessions via the Agent SDK.


## Installation

```bash
# Via Homebrew
brew tap misbahsy/tap
brew install cc-bridge

# Or via npm
npm install -g cc-bridge
```

## Quick Start

```bash
ccb setup    # Interactive setup wizard
ccb start    # Start the bridge
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

```bash
brew install --cask misbahsy/tap/ccb
```

Features: menu bar status, one-click start/stop, pairing approvals, setup wizard, live logs.

## CLI Commands

```bash
ccb setup                     # Interactive setup wizard
ccb start                     # Start the bridge
ccb status                    # Show current status

ccb pairing list              # List pending pairing requests
ccb pairing approve <code>    # Approve a pairing code

ccb sessions list             # List all sessions
ccb allowlist add <chatKey>   # Add to allowlist
```

## In-Chat Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/new` | Start a fresh session |
| `/sessions` | List your sessions |
| `/session <name>` | Switch to named session |
| `/status` | Show session status |
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
        "workspace": "~/projects",
        "model": "claude-sonnet-4-5"
      }
    ]
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "pairing"
    }
  }
}
```

### Environment Variables

```bash
export TELEGRAM_BOT_TOKEN="your-token"
export DISCORD_BOT_TOKEN="your-token"
```

### Security Policies

- **pairing** (recommended): New users receive a code to approve via CLI
- **allowlist**: Only pre-configured users can access
- **open**: Anyone can use the bot (not recommended)

## Architecture

```
Messaging Platforms        cc-bridge           Claude Code
(Telegram, Discord)  ───►  Session Manager  ───►  SDK Sessions
                           │                       │
Webhooks (Gmail, etc) ───► Router ───────────────► Your Skills & MCP Servers
```

The bridge spawns Claude Code sessions using the SDK, inheriting your skills, MCP servers, and settings.

---

## Terms of Service & Legal Compliance

This bridge routes messages through your personal Claude Code installation using your Claude subscription.

### Acceptable Use

- Personal use only across your own devices
- Only you (the subscription holder) send messages
- Set `dmPolicy` to "pairing" or "allowlist" and only approve your own accounts

### What to Avoid

- Setting `dmPolicy` to `"open"`
- Approving pairing codes for other people
- Sharing bot tokens or running on public servers
- Commercial use or providing Claude access to others

### For Multi-User or Commercial Use

Use [Anthropic's Official API](https://www.anthropic.com/api) or contact them for enterprise plans.

### Disclaimer

You are solely responsible for compliance with [Anthropic's Terms of Service](https://www.anthropic.com/legal/consumer-terms). This software is provided as-is with no warranties.

---

## License

MIT - This software is not affiliated with or endorsed by Anthropic.
