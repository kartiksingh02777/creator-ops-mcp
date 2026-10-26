import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseSrt } from "../src/ingestion/srt.js";
import { parseVtt } from "../src/ingestion/vtt.js";
import { parsePlainText } from "../src/ingestion/text.js";
import { parseTimestampToSeconds, formatSecondsToTimestamp, formatSecondsToShortTimestamp } from "../src/lib/time.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

// ---------------------------------------------------------------------------
// Timestamp utilities
// ---------------------------------------------------------------------------

describe("parseTimestampToSeconds", () => {
  it("parses HH:MM:SS,mmm format (SRT)", () => {
    expect(parseTimestampToSeconds("01:24:30,500")).toBeCloseTo(5070.5, 2);
  });

  it("parses HH:MM:SS.mmm format (VTT)", () => {
    expect(parseTimestampToSeconds("01:24:30.500")).toBeCloseTo(5070.5, 2);
  });

  it("parses MM:SS.mmm short format", () => {
    expect(parseTimestampToSeconds("01:24.000")).toBeCloseTo(84, 2);
  });

  it("parses 00:00:00,000 as 0", () => {
    expect(parseTimestampToSeconds("00:00:00,000")).toBe(0);
  });

  it("throws on invalid format", () => {
    expect(() => parseTimestampToSeconds("invalid")).toThrow();
  });
});

describe("formatSecondsToTimestamp", () => {
  it("formats 5070.5 seconds to 01:24:30", () => {
    expect(formatSecondsToTimestamp(5070.5)).toBe("01:24:30");
  });

  it("formats 0 to 00:00:00", () => {
    expect(formatSecondsToTimestamp(0)).toBe("00:00:00");
  });

  it("formats 3600 to 01:00:00", () => {
    expect(formatSecondsToTimestamp(3600)).toBe("01:00:00");
  });
});

describe("formatSecondsToShortTimestamp", () => {
  it("formats 84 seconds to 01:24", () => {
    expect(formatSecondsToShortTimestamp(84)).toBe("01:24");
  });

  it("formats 0 to 00:00", () => {
    expect(formatSecondsToShortTimestamp(0)).toBe("00:00");
  });
});

// ---------------------------------------------------------------------------
// SRT parsing
// ---------------------------------------------------------------------------

describe("parseSrt", () => {
  it("parses sample-podcast.srt into valid cues", () => {
    const content = loadFixture("sample-podcast.srt");
    const cues = parseSrt(content);

    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) {
      expect(cue.index).toBeGreaterThan(0);
      expect(cue.startSec).toBeGreaterThanOrEqual(0);
      expect(cue.endSec).toBeGreaterThan(cue.startSec);
      expect(cue.text.length).toBeGreaterThan(0);
    }
  });

  it("sorts cues by ascending startSec", () => {
    const content = loadFixture("sample-podcast.srt");
    const cues = parseSrt(content);

    for (let i = 1; i < cues.length; i++) {
      expect(cues[i]!.startSec).toBeGreaterThanOrEqual(cues[i - 1]!.startSec);
    }
  });

  it("strips HTML tags from cue text", () => {
    const srtWithTags = `1
00:00:01,000 --> 00:00:04,000
<b>Bold text</b> and <i>italic</i> content here

`;
    const cues = parseSrt(srtWithTags);
    expect(cues[0]!.text).toBe("Bold text and italic content here");
    expect(cues[0]!.text).not.toContain("<");
  });

  it("handles CRLF line endings", () => {
    const crlfContent = "1\r\n00:00:01,000 --> 00:00:04,000\r\nHello world\r\n\r\n";
    const cues = parseSrt(crlfContent);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe("Hello world");
  });

  it("throws ParseError on content with no valid cues", () => {
    expect(() => parseSrt("This is not an SRT file at all")).toThrow();
  });

  it("correctly parses millisecond precision", () => {
    const srt = `1
00:00:01,500 --> 00:00:04,750
Test cue

`;
    const cues = parseSrt(srt);
    expect(cues[0]!.startSec).toBeCloseTo(1.5, 2);
    expect(cues[0]!.endSec).toBeCloseTo(4.75, 2);
  });
});

// ---------------------------------------------------------------------------
// VTT parsing
// ---------------------------------------------------------------------------

describe("parseVtt", () => {
  it("parses a minimal VTT file", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello from VTT

00:00:05.000 --> 00:00:09.000
Second cue here

`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe("Hello from VTT");
    expect(cues[0]!.startSec).toBeCloseTo(1.0, 2);
  });

  it("throws if file does not start with WEBVTT", () => {
    expect(() => parseVtt("No header here\n\n1\n00:00:01.000 --> 00:00:02.000\ntext")).toThrow();
  });

  it("strips VTT styling tags", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<b>Bold</b> and <i>italic</i> cue text

`;
    const cues = parseVtt(vtt);
    expect(cues[0]!.text).toBe("Bold and italic cue text");
    expect(cues[0]!.text).not.toContain("<");
  });

  it("handles VTT cue settings (position, align) in timecode line", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000 align:start position:0%
Text with settings line

`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe("Text with settings line");
  });

  it("sorts cues ascending by startSec", () => {
    const vtt = `WEBVTT

00:00:05.000 --> 00:00:08.000
Second

00:00:01.000 --> 00:00:04.000
First

`;
    const cues = parseVtt(vtt);
    expect(cues[0]!.startSec).toBeLessThan(cues[1]!.startSec);
  });

  it("skips STYLE blocks without throwing", () => {
    const vtt = `WEBVTT

STYLE
::cue {
  color: white;
  background: black;
}

00:00:01.000 --> 00:00:04.000
Actual cue

`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Plain text parsing
// ---------------------------------------------------------------------------

describe("parsePlainText", () => {
  it("creates synthetic timecodes from plain text", () => {
    const text =
      "This is the first sentence of the transcript. It contains some useful information. " +
      "Here is another point about the topic. And yet another important detail follows.";
    const cues = parsePlainText(text);

    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]!.startSec).toBe(0);
    for (const cue of cues) {
      expect(cue.endSec).toBeGreaterThan(cue.startSec);
    }
  });

  it("produces ascending timecodes", () => {
    const text = Array(20).fill("This is a sentence with some content.").join(" ");
    const cues = parsePlainText(text);

    for (let i = 1; i < cues.length; i++) {
      expect(cues[i]!.startSec).toBeGreaterThanOrEqual(cues[i - 1]!.endSec - 0.01);
    }
  });

  it("throws on content shorter than 10 chars", () => {
    expect(() => parsePlainText("Too short")).toThrow();
  });

  it("assigns sequential indexes", () => {
    const text = Array(10).fill("This is a sentence.").join(" ");
    const cues = parsePlainText(text);

    cues.forEach((c, i) => {
      expect(c.index).toBe(i + 1);
    });
  });
});
