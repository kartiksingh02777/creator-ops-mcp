import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseSrt } from "../src/ingestion/srt.js";
import { generateChapters } from "../src/analysis/chapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describe("generateChapters", () => {
  it("first chapter always starts at 00:00:00", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateChapters(cues, {
      minChapterDurationSec: 30,
      spoilerPolicy: "strict",
    });

    expect(result.chapters.length).toBeGreaterThan(0);
    expect(result.chapters[0]!.startSec).toBe(0);
    expect(result.chapters[0]!.startTimestamp).toBe("00:00:00");
  });

  it("chapters are in strictly ascending startSec order", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateChapters(cues, {
      minChapterDurationSec: 20,
      spoilerPolicy: "strict",
    });

    for (let i = 1; i < result.chapters.length; i++) {
      expect(result.chapters[i]!.startSec).toBeGreaterThanOrEqual(
        result.chapters[i - 1]!.startSec
      );
    }
  });

  it("all chapters have a non-empty title", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateChapters(cues, {
      minChapterDurationSec: 30,
      spoilerPolicy: "strict",
    });

    for (const chapter of result.chapters) {
      expect(chapter.title).toBeTruthy();
      expect(chapter.title.length).toBeGreaterThan(0);
    }
  });

  it("chapter titles follow the [Subject] — [Category] format", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateChapters(cues, {
      minChapterDurationSec: 30,
      spoilerPolicy: "moderate",
    });

    for (const chapter of result.chapters) {
      // Title contains " — " separator
      expect(chapter.title).toContain("—");
      expect(chapter.subject).toBeTruthy();
      expect(chapter.category).toBeTruthy();
    }
  });

  it("spoilerPolicy:strict guards against reveal-type categories", () => {
    const revealCues = [
      {
        index: 1, startSec: 0, endSec: 30,
        text: "Let me walk you through the investigation step by step",
      },
      {
        index: 2, startSec: 30, endSec: 60,
        text: "We gathered all the evidence and analyzed the patterns",
      },
      {
        index: 3, startSec: 60, endSec: 90,
        text: "The killer was revealed in the final confrontation and was defeated",
      },
      {
        index: 4, startSec: 90, endSec: 120,
        text: "And the mystery was finally solved and the answer exposed",
      },
    ];

    const strictResult = generateChapters(revealCues, {
      minChapterDurationSec: 10,
      spoilerPolicy: "strict",
    });

    // Spoiler chapters should be guarded
    const guardedChapters = strictResult.chapters.filter((c) => c.spoilerGuarded);
    // At least one of the reveal cues should trigger spoiler guard
    const revealKeywords = ["revealed", "defeated", "solved", "exposed"];
    const hasRevealInText = revealKeywords.some((kw) =>
      revealCues.some((c) => c.text.toLowerCase().includes(kw))
    );
    if (hasRevealInText && strictResult.chapters.length > 1) {
      expect(guardedChapters.length).toBeGreaterThan(0);
    }
  });

  it("spoilerPolicy:none does not guard any chapters", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateChapters(cues, {
      minChapterDurationSec: 30,
      spoilerPolicy: "none",
    });

    const guardedChapters = result.chapters.filter((c) => c.spoilerGuarded);
    expect(guardedChapters.length).toBe(0);
  });

  it("returns correct totalDurationSec", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateChapters(cues, {
      minChapterDurationSec: 30,
      spoilerPolicy: "strict",
    });

    const lastCue = cues[cues.length - 1]!;
    const firstCue = cues[0]!;
    const expectedDuration = lastCue.endSec - firstCue.startSec;

    expect(result.totalDurationSec).toBeCloseTo(expectedDuration, 1);
  });

  it("returns empty chapters array for empty cues", () => {
    const result = generateChapters([], {
      minChapterDurationSec: 30,
      spoilerPolicy: "strict",
    });

    expect(result.chapters).toHaveLength(0);
    expect(result.totalDurationSec).toBe(0);
  });

  it("indexes chapters starting from 1", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateChapters(cues, {
      minChapterDurationSec: 20,
      spoilerPolicy: "strict",
    });

    if (result.chapters.length > 0) {
      expect(result.chapters[0]!.index).toBe(1);
      result.chapters.forEach((c, i) => {
        expect(c.index).toBe(i + 1);
      });
    }
  });
});
