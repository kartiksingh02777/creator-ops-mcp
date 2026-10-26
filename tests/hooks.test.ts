import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseSrt } from "../src/ingestion/srt.js";
import { analyzeHooks } from "../src/analysis/hooks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describe("analyzeHooks", () => {
  it("returns candidates sorted descending by ShortScore", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = analyzeHooks(cues, { targetDurationSec: 60, maxResults: 5 });

    expect(result.candidates.length).toBeGreaterThan(0);

    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1]!.shortScore).toBeGreaterThanOrEqual(
        result.candidates[i]!.shortScore
      );
    }
  });

  it("assigns sequential ranks starting from 1", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = analyzeHooks(cues, { targetDurationSec: 60, maxResults: 5 });

    result.candidates.forEach((c, idx) => {
      expect(c.rank).toBe(idx + 1);
    });
  });

  it("rejects cues starting with filler phrases", () => {
    const fillerCues = [
      {
        index: 1,
        startSec: 0,
        endSec: 8,
        text: "Hey guys, welcome back to the channel today we're going to cover something amazing",
      },
      {
        index: 2,
        startSec: 8,
        endSec: 16,
        text: "In this video I will show you how to grow your podcast",
      },
      {
        index: 3,
        startSec: 16,
        endSec: 24,
        text: "Welcome back everyone make sure to like and subscribe",
      },
      {
        index: 4,
        startSec: 24,
        endSec: 32,
        text: "Before we get started please smash that subscribe button",
      },
    ];

    // Create a minimal cue set where all windows start with filler
    const result = analyzeHooks(fillerCues, {
      targetDurationSec: 30,
      maxResults: 5,
    });

    expect(result.totalRejected).toBeGreaterThan(0);
    expect(result.rejectionSummary["Starts with filler phrase"]).toBeGreaterThan(0);
  });

  it("rejects cues with dangling pronouns in first sentence", () => {
    const danglingCues = [
      {
        index: 1,
        startSec: 0,
        endSec: 8,
        text: "It is something that will change your life forever",
      },
      {
        index: 2,
        startSec: 8,
        endSec: 16,
        text: "This is the most important thing I have ever discovered",
      },
      {
        index: 3,
        startSec: 16,
        endSec: 24,
        text: "They are doing it wrong and you need to know why",
      },
    ];

    const result = analyzeHooks(danglingCues, {
      targetDurationSec: 20,
      maxResults: 5,
    });

    expect(result.totalRejected).toBeGreaterThan(0);
    expect(
      result.rejectionSummary["Unresolved pronoun in first sentence"]
    ).toBeGreaterThan(0);
  });

  it("scores ShortScore between 0 and 20", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = analyzeHooks(cues, { targetDurationSec: 60, maxResults: 10 });

    for (const candidate of result.candidates) {
      expect(candidate.shortScore).toBeGreaterThanOrEqual(0);
      expect(candidate.shortScore).toBeLessThanOrEqual(20);
    }
  });

  it("score breakdown components sum approximately to shortScore via formula", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = analyzeHooks(cues, { targetDurationSec: 60, maxResults: 5 });

    for (const c of result.candidates) {
      const { H, R, E, P, C, S } = c.scoreBreakdown;
      const computed =
        Math.round(
          (0.3 * H + 0.2 * R + 0.2 * E + 0.15 * P + 0.1 * C + 0.05 * S) * 10
        ) / 10;
      expect(c.shortScore).toBeCloseTo(computed, 1);
    }
  });

  it("respects maxResults limit", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = analyzeHooks(cues, { targetDurationSec: 60, maxResults: 3 });
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it("returns endSec greater than startSec for all candidates", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = analyzeHooks(cues, { targetDurationSec: 60, maxResults: 10 });

    for (const c of result.candidates) {
      expect(c.endSec).toBeGreaterThan(c.startSec);
    }
  });

  it("provides hook pattern name for all non-rejected candidates", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = analyzeHooks(cues, { targetDurationSec: 60, maxResults: 10 });

    for (const c of result.candidates) {
      expect(c.hookPattern).toBeTruthy();
    }
  });
});
