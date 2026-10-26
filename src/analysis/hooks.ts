import { formatSecondsToShortTimestamp, getDurationSeconds } from "../lib/time.js";
import type {
  TranscriptCue,
  ShortCandidate,
  ShortHookResult,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Constants & lookup tables
// ---------------------------------------------------------------------------

const FILLER_STARTS = [
  /^hey\s+guys/i,
  /^welcome\s+back/i,
  /^in\s+this\s+video/i,
  /^what('s|\s+is)\s+up\s+(guys|everyone|y'all)/i,
  /^so\s+today\s+(we('re|'ll|'re going to)|I('m|'ll|'m going to))/i,
  /^if\s+you('re|\s+are)\s+new\s+here/i,
  /^before\s+we\s+(get|start|dive)/i,
  /^make\s+sure\s+to\s+(like|subscribe)/i,
  /^smash\s+that\s+(like|subscribe)/i,
  /^don('t|t)\s+forget\s+to\s+(like|subscribe)/i,
];

/** Unresolved pronouns in first sentence — no antecedent context */
const DANGLING_PRONOUNS = /^(it|this|these|those|they|he|she|that)\s+(is|are|was|were|did|does|do|can|will|would|has|have)/i;

/** Dead zone: >18 seconds without new beat — penalized in pacing */
const DEAD_ZONE_SEC = 18;

// ---------------------------------------------------------------------------
// Hook pattern scoring (H component, max score contributes to 0–20 range)
// ---------------------------------------------------------------------------

interface HookPattern {
  name: string;
  patterns: RegExp[];
  baseScore: number; // 0–20 range
}

const HOOK_PATTERNS: HookPattern[] = [
  {
    name: "Bold Claim",
    patterns: [
      /\b(nobody|no one|most people|everyone|the truth|the real|actually|secretly|surprising|shocking)\b/i,
      /\b(changed my|ruined my|destroyed my|transformed my)\b/i,
      /\b(is (actually|secretly|completely|totally) (wrong|broken|fake|dead|over))\b/i,
    ],
    baseScore: 18,
  },
  {
    name: "Curiosity Gap",
    patterns: [
      /\b(the real reason|the truth (about|behind|is)|you won't believe|here's why|turns out|it turns out)\b/i,
      /\b(what (they|nobody|no one) (don't|doesn't|won't) tell you)\b/i,
      /\b(the secret (to|behind|of))\b/i,
    ],
    baseScore: 16,
  },
  {
    name: "Direct Stakes",
    patterns: [
      /\b(you('re| are) (losing|wasting|missing|killing)|stop (doing|using|making)|never (do|use|make) (this|that|it))\b/i,
      /\b(this (is|will) (cost|ruin|destroy|kill)|if you (don't|didn't|haven't))\b/i,
    ],
    baseScore: 18,
  },
  {
    name: "Contradiction",
    patterns: [
      /\b(but|however|yet|still|actually|instead|rather|contrary)\b.*\b(wrong|false|myth|lie|backward|opposite|reverse)\b/i,
      /\b(everything you know about|common (belief|advice|wisdom) (is|about))\b/i,
    ],
    baseScore: 17,
  },
  {
    name: "Numbered Specificity",
    patterns: [
      /\b([2-9]|1[0-9]|20)\s+(things?|ways?|steps?|reasons?|mistakes?|tips?|tricks?|hacks?|secrets?|signs?)\b/i,
      /\b(in just \d+|within \d+|only \d+)\b/i,
    ],
    baseScore: 14,
  },
  {
    name: "Before/After",
    patterns: [
      /\b(before\s+.{3,30}\s+(after|now)|from\s+.{3,30}\s+to\s+.{3,30}|went from|used to\b)/i,
      /\b(i tested|i tried|i spent \d+|after \d+ (days?|weeks?|months?|years?))\b/i,
    ],
    baseScore: 15,
  },
  {
    name: "Immediate Conflict",
    patterns: [
      /\b(fight|battle|clash|vs\.?|versus|against|war|crisis|disaster|collapse|fail(ed|ure)|broke|broke down)\b/i,
      /\b(almost (lost|died|failed|quit|gave up))\b/i,
    ],
    baseScore: 16,
  },
];

// ---------------------------------------------------------------------------
// Emotion lexicon (E component)
// ---------------------------------------------------------------------------

interface EmotionClass {
  name: string;
  patterns: RegExp[];
  weight: number; // Raw weight used in scoring
}

const EMOTION_CLASSES: EmotionClass[] = [
  {
    name: "fear_loss",
    weight: 16,
    patterns: [
      /\b(lose|lost|losing|miss|missed|missing|regret|regrets?|too late|never again|last chance)\b/i,
      /\b(danger(ous)?|risk(y)?|threat|harmful|deadly|fatal|toxic|poison)\b/i,
    ],
  },
  {
    name: "greed_gain",
    weight: 15,
    patterns: [
      /\b(earn|profit|gain|make money|rich|wealth|income|revenue|free|save|bargain|deal)\b/i,
      /\b(hack|shortcut|secret|trick|tip|upgrade|boost|double|triple|10x)\b/i,
    ],
  },
  {
    name: "shock",
    weight: 14,
    patterns: [
      /\b(shocking|unbelievable|insane|insanely|insanity|crazy|mindblowing|mind-blowing|wtf|unreal|wild)\b/i,
      /\b(i can't believe|you won't believe|never expected|blown away|jaw-drop)\b/i,
    ],
  },
  {
    name: "curiosity",
    weight: 14,
    patterns: [
      /\b(why|how|what if|discover(ed)?|reveal(ed)?|secret(ly)?|hidden|mystery|unknown|ever wonder)\b/i,
      /\b(the answer (is|to)|turns out|it turns out|here's (what|how|why|the))\b/i,
    ],
  },
  {
    name: "status",
    weight: 13,
    patterns: [
      /\b(elite|pro(fessional)?|expert|master|top \d+%|level up|ahead of|better than|smarter|faster)\b/i,
      /\b(people respect|stand out|impress|admire|envy|jealous)\b/i,
    ],
  },
  {
    name: "validation",
    weight: 12,
    patterns: [
      /\b(not (alone|your fault|crazy)|normal|valid|okay to|it's okay|relatable|everyone does|most people)\b/i,
      /\b(finally|at last|exactly what|been waiting|been looking)\b/i,
    ],
  },
];

// ---------------------------------------------------------------------------
// Open-loop markers (R component)
// ---------------------------------------------------------------------------

const OPEN_LOOP_OPENERS = [
  /\bthe real reason\b/i,
  /\byou won't believe\b/i,
  /\bwhat (really|actually) happened\b/i,
  /\bhere's (what|why|how)\b/i,
  /\bthe secret (is|to|behind)\b/i,
  /\buntil (something|everything|it all)\b/i,
  /\bbut then\b/i,
  /\bwhat (no one|nobody) tells you\b/i,
];

const OPEN_LOOP_CLOSERS = [
  /\bso (that's|that is|this is|here's) (why|how|what)\b/i,
  /\band (that's|that is) when\b/i,
  /\bturns out\b/i,
  /\bthe answer (is|was)\b/i,
  /\band it (worked|paid off|changed|made|was)\b/i,
  /\bso (now|today|here)\b/i,
  /\bwhich means\b/i,
  /\bthe result\b/i,
];

// ---------------------------------------------------------------------------
// Core scoring helpers
// ---------------------------------------------------------------------------

function scoreHook(firstText: string): {
  score: number;
  pattern: string;
  rejected: boolean;
  rejectionReason?: string;
} {
  // Hard rejection: filler starts
  for (const filler of FILLER_STARTS) {
    if (filler.test(firstText)) {
      return {
        score: 0,
        pattern: "none",
        rejected: true,
        rejectionReason: "Starts with filler phrase",
      };
    }
  }

  // Hard rejection: dangling pronouns
  if (DANGLING_PRONOUNS.test(firstText)) {
    return {
      score: 0,
      pattern: "none",
      rejected: true,
      rejectionReason: "Unresolved pronoun in first sentence",
    };
  }

  let bestScore = 0;
  let bestPattern = "Generic";

  for (const hookPattern of HOOK_PATTERNS) {
    const matched = hookPattern.patterns.some((re) => re.test(firstText));
    if (matched && hookPattern.baseScore > bestScore) {
      bestScore = hookPattern.baseScore;
      bestPattern = hookPattern.name;
    }
  }

  return { score: bestScore, pattern: bestPattern, rejected: false };
}

function scoreEmotion(text: string): number {
  let best = 0;
  for (const ec of EMOTION_CLASSES) {
    const matched = ec.patterns.some((re) => re.test(text));
    if (matched && ec.weight > best) {
      best = ec.weight;
    }
  }
  return best;
}

function scoreRetention(cues: TranscriptCue[]): number {
  const fullText = cues.map((c) => c.text).join(" ");

  const hasOpenLoop = OPEN_LOOP_OPENERS.some((re) => re.test(fullText));
  const hasClosedLoop = OPEN_LOOP_CLOSERS.some((re) => re.test(fullText));

  if (hasOpenLoop && hasClosedLoop) return 20;
  if (hasOpenLoop) return 12; // Opened but didn't resolve = partial credit
  if (hasClosedLoop) return 10; // Resolved something (payoff without setup)
  return 5; // Straight narration
}

function scorePacing(cues: TranscriptCue[], targetDurationSec: number): number {
  if (cues.length === 0) return 0;

  let deadZones = 0;
  let totalConcepts = 0;

  for (let i = 1; i < cues.length; i++) {
    const gap = cues[i]!.startSec - cues[i - 1]!.endSec;
    if (gap > DEAD_ZONE_SEC) deadZones++;
  }

  // Concept density: unique noun phrases approximated by distinct sentence starters
  const sentences = cues
    .flatMap((c) => c.text.split(/[.!?]+/))
    .map((s) => s.trim())
    .filter(Boolean);
  totalConcepts = new Set(sentences.map((s) => s.slice(0, 20).toLowerCase())).size;

  const conceptsPerMinute = (totalConcepts / targetDurationSec) * 60;
  const densityScore = Math.min(15, Math.max(0, Math.round(conceptsPerMinute * 1.5)));

  const deduction = Math.min(15, deadZones * 5);
  return Math.max(0, densityScore - deduction);
}

function scoreClarity(firstText: string, fullText: string): number {
  let score = 10;

  // Penalize passive constructions
  if (/\b(it was|they were|there are|there were|there is)\b/i.test(firstText)) {
    score -= 2;
  }

  // Penalize excessive hedging
  const hedgeCount = (fullText.match(/\b(maybe|perhaps|kind of|sort of|I think|I guess|basically|literally|actually)\b/gi) ?? []).length;
  score -= Math.min(5, Math.floor(hedgeCount / 3));

  return Math.max(0, score);
}

function scoreSafety(cues: TranscriptCue[]): number {
  const text = cues.map((c) => c.text).join(" ");

  // Check for dangling references (mentions something outside clip)
  const hasDanglingRef = /\b(as (I|we) mentioned (earlier|before|above)|see (the|my) (previous|other)|in (part|episode|chapter) \d+)\b/i.test(text);
  if (hasDanglingRef) return 2;

  // Check for abrupt cut (ends mid-sentence)
  const lastCue = cues[cues.length - 1];
  if (lastCue && !/[.!?]$/.test(lastCue.text.trim())) return 3;

  return 5;
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

/** Segments transcript into clip windows for scoring */
function buildClipWindows(
  cues: TranscriptCue[],
  targetDurationSec: number
): TranscriptCue[][] {
  if (cues.length === 0) return [];

  const windows: TranscriptCue[][] = [];

  // Try windows starting at each cue
  for (let i = 0; i < cues.length; i++) {
    const startSec = cues[i]!.startSec;
    const targetEnd = startSec + targetDurationSec;

    const window: TranscriptCue[] = [];
    for (let j = i; j < cues.length; j++) {
      if (cues[j]!.startSec > targetEnd + 10) break; // Allow 10s overshoot
      window.push(cues[j]!);
    }

    const windowDuration = getDurationSeconds(
      window[0]?.startSec ?? 0,
      window[window.length - 1]?.endSec ?? 0
    );

    // Skip windows shorter than 15 seconds or longer than 3x target
    if (windowDuration < 15 || windowDuration > targetDurationSec * 3) continue;

    // Deduplicate near-identical windows (same first+last cue)
    const isDuplicate = windows.some(
      (w) => w[0]?.index === window[0]?.index && w[w.length - 1]?.index === window[window.length - 1]?.index
    );
    if (!isDuplicate) {
      windows.push(window);
    }

    // Limit total candidates to 50 for performance
    if (windows.length >= 50) break;
  }

  return windows;
}

export function analyzeHooks(
  cues: TranscriptCue[],
  options: {
    targetDurationSec: number;
    maxResults: number;
  }
): ShortHookResult {
  const { targetDurationSec, maxResults } = options;
  const windows = buildClipWindows(cues, targetDurationSec);

  const candidates: ShortCandidate[] = [];
  const rejectedCount: Record<string, number> = {};
  let totalRejected = 0;

  for (const window of windows) {
    if (window.length === 0) continue;

    const firstCue = window[0]!;
    const lastCue = window[window.length - 1]!;
    const fullText = window.map((c) => c.text).join(" ");

    const hookResult = scoreHook(firstCue.text);

    if (hookResult.rejected) {
      totalRejected++;
      const reason = hookResult.rejectionReason ?? "Unknown";
      rejectedCount[reason] = (rejectedCount[reason] ?? 0) + 1;
      continue;
    }

    // Component scores (each on their raw scale)
    const H = hookResult.score; // 0–20 (patterns range 14–18)
    const R = scoreRetention(window); // 0–20
    const E = scoreEmotion(fullText); // 0–16 (highest emotion weight)
    const P = scorePacing(window, targetDurationSec); // 0–15
    const C = scoreClarity(firstCue.text, fullText); // 0–10
    const S = scoreSafety(window); // 0–5

    // Normalize to 0–20 scale for formula (P→0-20, E→0-20)
    const H_n = H; // Already 0–20
    const R_n = R; // Already 0–20
    const E_n = Math.round((E / 16) * 20); // Normalize 0-16 → 0-20
    const P_n = Math.round((P / 15) * 20); // Normalize 0-15 → 0-20
    const C_n = Math.round((C / 10) * 20); // Normalize 0-10 → 0-20
    const S_n = Math.round((S / 5) * 20); // Normalize 0-5 → 0-20

    // ShortScore = 0.30·H + 0.20·R + 0.20·E + 0.15·P + 0.10·C + 0.05·S
    const shortScore =
      Math.round(
        (0.3 * H_n + 0.2 * R_n + 0.2 * E_n + 0.15 * P_n + 0.1 * C_n + 0.05 * S_n) * 10
      ) / 10;

    const durationSec = getDurationSeconds(firstCue.startSec, lastCue.endSec);

    candidates.push({
      rank: 0, // Set after sort
      startSec: firstCue.startSec,
      endSec: lastCue.endSec,
      durationSec,
      startTimestamp: formatSecondsToShortTimestamp(firstCue.startSec),
      endTimestamp: formatSecondsToShortTimestamp(lastCue.endSec),
      hookText: firstCue.text,
      shortScore,
      scoreBreakdown: { H: H_n, R: R_n, E: E_n, P: P_n, C: C_n, S: S_n },
      hookPattern: hookResult.pattern,
    });
  }

  // Sort descending by ShortScore, assign ranks
  candidates.sort((a, b) => b.shortScore - a.shortScore);
  candidates.forEach((c, i) => {
    c.rank = i + 1;
  });

  return {
    candidates: candidates.slice(0, maxResults),
    totalAnalyzed: windows.length,
    totalRejected,
    rejectionSummary: rejectedCount,
  };
}
