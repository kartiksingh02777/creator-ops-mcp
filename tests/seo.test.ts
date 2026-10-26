import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseSrt } from "../src/ingestion/srt.js";
import { generateSeoMetadata } from "../src/analysis/seo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describe("generateSeoMetadata", () => {
  it("returns exactly 5 title archetypes", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    expect(result.titleMatrix).toHaveLength(5);
  });

  it("all title archetype names are correct", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    const archetypes = result.titleMatrix.map((t) => t.archetype);
    expect(archetypes).toContain("curiosity_gap");
    expect(archetypes).toContain("fomo");
    expect(archetypes).toContain("before_after");
    expect(archetypes).toContain("extreme_contrast");
    expect(archetypes).toContain("authority_proof");
  });

  it("all titles are under 60 characters", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    for (const title of result.titleMatrix) {
      expect(title.title.length).toBeLessThanOrEqual(60);
      expect(title.characterCount).toBeLessThanOrEqual(60);
      // characterCount should match actual title length
      expect(title.characterCount).toBe(title.title.length);
    }
  });

  it("each title has a non-empty psychologicalTrigger", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    for (const title of result.titleMatrix) {
      expect(title.psychologicalTrigger).toBeTruthy();
      expect(title.psychologicalTrigger.length).toBeGreaterThan(10);
    }
  });

  it("thumbnail brief has correct 16:9 aspect ratio and 1280x720 resolution", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    expect(result.thumbnailBrief.aspectRatio).toBe("16:9");
    expect(result.thumbnailBrief.resolution).toBe("1280x720");
  });

  it("thumbnail brief has valid subjectPosition", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    expect(["left-third", "right-third", "center"]).toContain(
      result.thumbnailBrief.subjectPosition
    );
  });

  it("thumbnail brief contains both Midjourney and Flux prompts", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    expect(result.thumbnailBrief.promptMidjourney).toBeTruthy();
    expect(result.thumbnailBrief.promptFlux).toBeTruthy();
    expect(result.thumbnailBrief.negativePrompt).toBeTruthy();
  });

  it("Midjourney prompt includes 16:9 aspect ratio flag", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    expect(result.thumbnailBrief.promptMidjourney).toContain("16:9");
  });

  it("thumbnail brief text overlay is uppercase and non-empty", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    const overlay = result.thumbnailBrief.textOverlay;
    expect(overlay).toBeTruthy();
    expect(overlay).toBe(overlay.toUpperCase());
  });

  it("returns a recommended title that exists in the titleMatrix", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    const matrixArchetypes = result.titleMatrix.map((t) => t.archetype);
    expect(matrixArchetypes).toContain(result.recommendedTitle.archetype);
  });

  it("returns suggested tags as an array of strings", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    expect(Array.isArray(result.suggestedTags)).toBe(true);
    expect(result.suggestedTags.length).toBeGreaterThan(0);
    for (const tag of result.suggestedTags) {
      expect(typeof tag).toBe("string");
    }
  });

  it("returns a non-empty suggested description", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    expect(result.suggestedDescription).toBeTruthy();
    expect(result.suggestedDescription.length).toBeGreaterThan(50);
  });

  it("color palette has exactly 4 entries", () => {
    const cues = parseSrt(loadFixture("sample-podcast.srt"));
    const result = generateSeoMetadata(cues, {});

    expect(result.thumbnailBrief.colorPalette).toHaveLength(4);
    for (const color of result.thumbnailBrief.colorPalette) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{3,6}$/);
    }
  });
});
