# creator-ops-mcp

[![npm version](https://badge.fury.io/js/creator-ops-mcp.svg)](https://www.npmjs.com/package/creator-ops-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

**Deterministic creator-ops layer for AI coding agents: turn any transcript into ranked Shorts, safe chapters, high-CTR metadata, and thumbnail briefs—locally, explainably, and without API keys.**

## Features

- 🎯 **Ranked Viral Shorts** — Mathematical ShortScore ranking of your best clip candidates
- 📑 **Non-Spoiling Chapters** — YouTube chapters with curiosity-preserving category labels
- 🔤 **5-Archetype Title Matrix** — Psychologically-tuned titles across proven CTR frameworks
- 🖼️ **Thumbnail Briefs** — Visual prompt specs for Midjourney/Flux, rule-of-thirds composed
- 🔒 **Zero API Keys** — Works fully offline with local .srt/.vtt/.txt files
- ✅ **Compliance Auditing** — Flags clickbait, demonetization triggers, and PII

## ShortScore Formula

```
ShortScore = 0.30·H + 0.20·R + 0.20·E + 0.15·P + 0.10·C + 0.05·S
```

| Weight | Component | Description |
|--------|-----------|-------------|
| 0.30 | **H** — Hook Strength | First-3-second pattern score (bold claim, curiosity gap, direct stakes, contradiction, numbered specificity, before/after, immediate conflict) |
| 0.20 | **R** — Retention Arc | Open-loop setup + payoff resolution within the clip |
| 0.20 | **E** — Emotional Trigger | Weighted emotion classes: fear/loss (16), greed/gain (15), shock (14), curiosity (14), status (13), validation (12) |
| 0.15 | **P** — Pacing | Concept density, dead-zone penalty (>18 sec without new beat) |
| 0.10 | **C** — Clarity | Filler rejection, pronoun ambiguity checks |
| 0.05 | **S** — Safe-to-Clip | Compliance clearance, no dangling references |

### Hard Rejection Rules

Clips are automatically rejected if they:
- Start with filler phrases: "hey guys", "welcome back", "in this video", etc.
- Contain unresolved pronouns in the first sentence ("it", "this", "they" without context)
- Have dead zones longer than 18 seconds without a new concept or narrative beat

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "creator-ops": {
      "command": "npx",
      "args": ["-y", "creator-ops-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add creator-ops -- npx -y creator-ops-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "creator-ops": {
      "command": "npx",
      "args": ["-y", "creator-ops-mcp"]
    }
  }
}
```

## Available Tools

### `extract_shorts_hooks`

Analyzes a transcript and returns ranked Shorts candidates with ShortScores.

**Input:**
```json
{
  "transcript": { "filePath": "/path/to/video.srt" },
  "context": {
    "contentType": "tutorial",
    "tone": "educational",
    "targetDurationSec": 60
  }
}
```

### `generate_chapters`

Generates non-spoiling YouTube chapters from a transcript.

**Input:**
```json
{
  "transcript": { "rawTranscript": "00:00 Introduction\n..." },
  "context": { "spoilerPolicy": "strict" }
}
```

### `generate_seo_metadata`

Produces a 5-archetype title matrix + thumbnail brief.

**Input:**
```json
{
  "transcript": { "filePath": "episode.vtt" },
  "context": { "contentType": "podcast", "tone": "conversational" }
}
```

### `audit_compliance`

Scans transcript and metadata for risk flags before publishing.

**Input:**
```json
{
  "transcript": { "rawTranscript": "..." },
  "metadata": { "title": "...", "description": "..." }
}
```

## Supported Transcript Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| SubRip | `.srt` | Standard subtitle format with millisecond precision |
| WebVTT | `.vtt` | Web video text tracks, strips styling tags |
| Plain Text | `.txt` | Synthetic timecodes at ~150 wpm |
| YouTube URL | `https://youtube.com/...` | Keyless public caption extraction |

## Development

```bash
git clone https://github.com/kartiksingh02777/creator-ops-mcp
cd creator-ops-mcp
npm install
npm run build
npm test
```

## License

MIT © Kartik Singh (kartiksingh02777)
