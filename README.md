# Loki.js

A modular Discord bot for CTF teams and tech communities: server scaffolding, temporary CTF workspaces, a daily CTF calendar, news digests, and optional 24/7 radio stations.

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Server setup**: `/setup preview` and `/setup apply` create the missing categories and channels from a predefined layout without duplicating existing ones.
- **Inbox and onboarding layouts**: `/server inbox-preview|apply`, `/server onboarding-preview|apply`, and `/server help`. `/server migrate-imp-stuff` moves messages using Mistral.
- **CTF workspaces**: `/ctf create`, `/ctf archive`, and temporary private workspaces with `/ctf start`, `/ctf extend`, `/ctf close`, `/ctf status` (duration 1-168 hours, default 24).
- **Daily CTF radar**: pulls events from the CTFtime API and the Unstop hackathon listing, posts a daily report (hour and minute configured in IST with `/ctf radar-config`), and can use Mistral to extract fields from event pages.
- **News digests**: scheduled digests for AI, cybersecurity, and tools from RSS/JSON feeds (CISA advisories, CISA KEV, The Hacker News, Hugging Face, Google AI blog, ProjectDiscovery, PortSwigger, HackTricks). Manage with `/news run|status|sources|pause|resume`.
- **Market update**: `/market update` posts an intraday stock news analysis scraped from Economic Times.
- **Radio**: two optional streaming stations (study and pop) in voice channels, controlled with `/radio setup|status|start|stop|restart|set-stream`, built on `@discordjs/voice` and `ffmpeg-static`.

The full command list is in [docs/commands.md](docs/commands.md).

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript (target ES2022), Node.js |
| Discord | discord.js 14, @discordjs/voice |
| AI | Mistral (`@mistralai/mistralai`), optional |
| Scheduling | node-cron |
| Data sources | rss-parser, cheerio, node-fetch |
| Audio | ffmpeg-static, libsodium-wrappers |

## Project structure

```
src/
  index.ts            bot entry point
  deploy-commands.ts  registers slash commands with Discord
  commands/           ctf, market, news, radio, server, setup
  config/             env loading, constants, server layout
  news/               fetchers, sources, Mistral formatting, scheduler, store
  market/             scraper, analyzer, scheduler
  radio/              stream client, manager, config
  utils/              CTFtime/Unstop fetchers, radar, workspaces, inbox
docs/                 command reference, screenshots
```

## Getting started

### Prerequisites

- Node.js 18 or newer
- A Discord application and bot token from the [Discord Developer Portal](https://discord.com/developers/applications)
- The bot invited to your server with permissions to manage channels and roles

### Install

```bash
git clone https://github.com/10k11/Loki.js.git
cd Loki.js
npm install
cp .env.example .env
```

### Environment variables

| Name | Required | Description | Where to get it |
|---|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token | Developer Portal, Bot tab |
| `CLIENT_ID` | Yes | Application ID | Developer Portal, General Information |
| `GUILD_ID` | Yes | Server the commands are registered to | Discord, Copy Server ID (developer mode) |
| `MISTRAL_API_KEY` | No | Enables Mistral-assisted extraction and digest formatting | [console.mistral.ai](https://console.mistral.ai) |
| `CTF_RADAR_CHANNEL` | No | Channel name for daily CTF reports (default `ctf-calendar`) | Your server |
| `MARKET_ANALYSIS_CHANNEL_ID` | No | Channel ID for market analysis | Your server |
| `MARKET_NEWS_CHANNEL_ID` | No | Channel ID for market news | Your server |
| `STUDY_RADIO_BOT_TOKEN`, `POP_RADIO_BOT_TOKEN` | No | One bot token per radio station | Developer Portal |
| `STUDY_STREAM_URL`, `POP_STREAM_URL` | No | Audio stream URLs | Any HTTP(S) stream |
| `STUDY_VOICE_CHANNEL_ID`, `POP_VOICE_CHANNEL_ID` | No | Voice channels for the stations (run `/radio setup` first) | Your server |
| `RADIO_ADMIN_USER_IDS` | No | Comma-separated user IDs allowed to control radio | Discord, Copy User ID |
| `STUDY_BOT_USER_ID`, `POP_BOT_USER_ID` | No | Radio bot user IDs, listed in `.env.example` | Discord, Copy User ID |

### Run

```bash
npm run deploy-commands   # register slash commands
npm run dev               # watch mode (tsx)
```

### Build

```bash
npm run build
npm start
```

## Usage

1. Run `/setup preview`, then `/setup apply` to create the channel layout.
2. Run `/ctf start name:<name> teammate:<@user>` to open a private workspace that expires after the given duration.
3. Run `/news status` and `/ctf radar-status` to check the scheduled jobs.

## Security notes

- Secrets are read from `.env`, which is git-ignored. Only `.env.example` is committed.
- Runtime state (CTF radar cache, workspaces, news cache) is written to `data/` in the working directory. It contains Discord server and user IDs and is git-ignored.
- Several commands create, move, and delete channels. Grant the bot only the permissions it needs.

## Roadmap

- Replace the "Localhost CTFs" branding strings in the server guide text with configurable values.

## License

MIT. See [LICENSE](LICENSE).

## Author

Lokesh Navale - [lokii.dev](https://lokii.dev) - [LinkedIn](https://www.linkedin.com/in/lokesh-navale/)
