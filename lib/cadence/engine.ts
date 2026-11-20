export type TalkMode = "hold" | "cue";

export type Phase =
  | "idle"
  | "hearing"
  | "holding"
  | "cuewait"
  | "ready"
  | "done"
  | "suppressed";

export type Settings = {
  mode: TalkMode;
  /** Silence that closes a thought when there's no punctuation. */
  silenceMs: number;
  /** Extra wait after the thought ends, before Measured Hold speaks. */
  holdMs: number;
  /** Short pause after a cue, before Quiet Cue speaks. */
  cuePauseMs: number;
  /** 0–1. Cues under this are ignored when the recognizer actually scored them. */
  confidenceFloor: number;
  questionIsCue: boolean;
  speak: boolean;
  phrases: string[];
  /** Added on top of silenceMs when a real hesitation turned out not to be the end. */
  learnedMs: number;
  /** True after Cadence has already answered. Closers then get silence, not another acknowledgement. */
  floorIsTheirs: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  mode: "hold",
  silenceMs: 2000,
  holdMs: 1250,
  cuePauseMs: 500,
  confidenceFloor: 0.8,
  questionIsCue: true,
  speak: true,
  phrases: ["hey ai", "hey cadence", "ok cadence"],
  learnedMs: 0,
  floorIsTheirs: false,
};

export type EngineState = {
  phase: Phase;
  buffer: string;
  lastWordAt: number | null;
  deadline: number | null;
  via: "punctuation" | "silence" | "forced" | null;
  cue: string | null;
  reason: string | null;
  switchTo: TalkMode | null;
  confidence: number;
};

export type EngineEvent =
  | { type: "word"; word: string; now: number; confidence?: number }
  | {
      type: "hypothesis";
      text: string;
      now: number;
      final: boolean;
      confidence?: number;
    }
  | { type: "tick"; now: number }
  | { type: "force-end"; now: number }
  | { type: "reset" };

export function initialEngine(): EngineState {
  return {
    phase: "idle",
    buffer: "",
    lastWordAt: null,
    deadline: null,
    via: null,
    cue: null,
    reason: null,
    switchTo: null,
    confidence: 1,
  };
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function endsWithTerminal(text: string): boolean {
  return /[.!?]["')\]]*$/.test(text.trim());
}

export function isQuestion(text: string): boolean {
  return /\?\s*["')\]]*$/.test(text.trim());
}

const FILLERS = new Set([
  "um",
  "uh",
  "uhh",
  "erm",
  "er",
  "hmm",
  "like",
  "so",
  "and",
  "but",
  "or",
  "because",
  "to",
  "the",
  "a",
  "an",
  "of",
  "for",
  "with",
  "i",
  "we",
  "you",
  "if",
  "when",
  "that",
  "just",
  "maybe",
  "probably",
  "actually",
  "well",
]);

/** A pause here is a stutter or a dropped thread, not a finished sentence. */
export function looksUnfinished(text: string): boolean {
  if (endsWithTerminal(text)) return false;
  const words = normalize(text).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const last = words[words.length - 1];
  if (FILLERS.has(last)) return true;
  if (words.length >= 2 && words[words.length - 1] === words[words.length - 2]) return true;
  return false;
}

export function wasAsked(text: string): boolean {
  if (isQuestion(text)) return true;
  const n = normalize(text).replace(/^(hey ai|hey cadence|ok cadence|okay cadence)\s+/, "");
  return /^(can|could|should|would|will|do|does|did|is|are|was|were|what|where|when|why|how|who)\b/.test(
    n,
  );
}

/** Thanks, okay, got it — the turn is over. Don't answer it. */
export function isCloser(text: string): boolean {
  const n = normalize(text).replace(/^(hey ai|hey cadence|ok cadence|okay cadence)\s+/, "");
  if (!n) return false;
  return /^(thanks|thank you|ok|okay|k|yeah|yep|yup|got it|sounds good|perfect|alright|all right|cool|that works|right|sure|fine|good|great|nice|understood|copy|will do|appreciate it|mm hmm|mhm|uh huh)( (so much|a lot|cadence|then|thanks|thank you|got it|yeah|i think so|that works|for me))?$/.test(
    n,
  );
}

export const SILENCE_CAP_MS = 3200;

export function silenceLine(cfg: Settings): number {
  return Math.min(SILENCE_CAP_MS, cfg.silenceMs + Math.max(0, cfg.learnedMs));
}

/** Sit 0.4s past a pause they talked through. Returns the new learnedMs. */
export function learnFromResume(cfg: Settings, gapMs: number): number {
  if (gapMs < 1000) return cfg.learnedMs;
  const line = silenceLine(cfg);
  if (gapMs + 400 <= line) return cfg.learnedMs;
  const nextLine = Math.min(SILENCE_CAP_MS, gapMs + 400);
  return Math.max(cfg.learnedMs, nextLine - cfg.silenceMs);
}

export function detectSwitch(text: string): TalkMode | null {
  let n = normalize(text);
  n = n.replace(/^(hey ai|hey cadence|ok cadence|okay cadence)\s+/, "");
  if (/^switch to (the )?(quiet|cue|listen only)( mode)?$/.test(n)) return "cue";
  if (/^switch to (the )?(measured )?(hold|delayed reply|delay)( mode)?$/.test(n))
    return "hold";
  return null;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wake phrase as a whole span, anywhere in the line. Longest phrase wins. */
export function matchPhrase(text: string, phrases: string[]): string | null {
  const n = normalize(text);
  const sorted = phrases
    .map((p) => ({ raw: p, n: normalize(p) }))
    .filter((p) => p.n.length > 0)
    .sort((a, b) => b.n.length - a.n.length);
  for (const p of sorted) {
    const re = new RegExp(`(?:^|\\s)${escapeReg(p.n)}(?:\\s|$)`);
    if (re.test(n)) return p.raw;
  }
  return null;
}

function finishSentence(
  state: EngineState,
  via: EngineState["via"],
  now: number,
  cfg: Settings,
  mode: TalkMode,
): EngineState {
  const sw = detectSwitch(state.buffer);
  if (sw) {
    return {
      ...state,
      phase: "cuewait",
      via,
      switchTo: sw,
      cue: "switch",
      reason: null,
      deadline: now + Math.min(cfg.cuePauseMs, 400),
    };
  }

  if (isCloser(state.buffer)) {
    return {
      ...state,
      phase: "suppressed",
      via,
      deadline: null,
      cue: null,
      switchTo: null,
      reason: "That's a close. Nothing more to add.",
    };
  }

  if (via !== "punctuation" && looksUnfinished(state.buffer)) {
    if (wasAsked(state.buffer)) {
      return {
        ...state,
        phase: "cuewait",
        via,
        switchTo: null,
        cue: "anchor",
        reason: "They asked, then lost the thread. One line on where they were, then stop.",
        deadline: now + Math.min(cfg.cuePauseMs, 500),
      };
    }
    return {
      ...state,
      phase: "suppressed",
      via,
      deadline: null,
      cue: null,
      switchTo: null,
      reason: "Still their thought — a stutter or a lost thread. Not taking the floor.",
    };
  }

  if (mode === "hold") {
    return {
      ...state,
      phase: "holding",
      via,
      switchTo: null,
      cue: null,
      reason: null,
      deadline: now + cfg.holdMs,
    };
  }

  const scored = state.confidence > 0;
  const clear = !scored || state.confidence >= cfg.confidenceFloor;
  const phrase = matchPhrase(state.buffer, cfg.phrases);

  if (phrase && !clear) {
    const pct = Math.round(state.confidence * 100);
    const need = Math.round(cfg.confidenceFloor * 100);
    return {
      ...state,
      phase: "suppressed",
      via,
      deadline: null,
      cue: null,
      switchTo: null,
      reason: `Wake word was muddy — ${pct}% , needs ${need}%.`,
    };
  }

  if (phrase) {
    return {
      ...state,
      phase: "cuewait",
      via,
      cue: phrase,
      switchTo: null,
      reason: null,
      deadline: now + cfg.cuePauseMs,
    };
  }

  if (cfg.questionIsCue && isQuestion(state.buffer)) {
    return {
      ...state,
      phase: "cuewait",
      via,
      cue: "question",
      switchTo: null,
      reason: null,
      deadline: now + cfg.cuePauseMs,
    };
  }

  return {
    ...state,
    phase: "suppressed",
    via,
    deadline: null,
    cue: null,
    switchTo: null,
    reason: cfg.questionIsCue
      ? "No wake word, and it wasn’t a direct question."
      : "No wake word in that line.",
  };
}

function hear(
  state: EngineState,
  buffer: string,
  now: number,
  confidence: number | undefined,
): EngineState {
  return {
    ...state,
    phase: "hearing",
    buffer,
    lastWordAt: now,
    deadline: null,
    via: null,
    cue: null,
    reason: null,
    switchTo: null,
    confidence: confidence == null || confidence <= 0 ? state.confidence || 1 : confidence,
  };
}

export function reduce(
  state: EngineState,
  event: EngineEvent,
  cfg: Settings,
  mode: TalkMode,
): EngineState {
  if (event.type === "reset") return initialEngine();

  if (event.type === "word") {
    const piece = event.word.trim();
    if (!piece) return state;
    const fresh = state.phase === "done" || state.phase === "idle";
    const buffer = fresh || !state.buffer ? piece : `${state.buffer} ${piece}`;
    const next = hear(state, buffer, event.now, event.confidence ?? 1);
    if (endsWithTerminal(buffer)) {
      return finishSentence(next, "punctuation", event.now, cfg, mode);
    }
    return next;
  }

  if (event.type === "hypothesis") {
    const text = event.text.trim();
    if (!text) return state;
    const next = hear(state, text, event.now, event.confidence ?? 0);
    if (event.final && endsWithTerminal(text)) {
      return finishSentence(next, "punctuation", event.now, cfg, mode);
    }
    return next;
  }

  if (event.type === "force-end") {
    if (!state.buffer.trim()) return { ...initialEngine() };
    if (state.phase === "hearing" || state.phase === "idle") {
      return finishSentence(state, "forced", event.now, cfg, mode);
    }
    return state;
  }

  if (event.type === "tick") {
    if (
      state.phase === "hearing" &&
      state.buffer.trim() &&
      state.lastWordAt != null &&
      event.now - state.lastWordAt >= silenceLine(cfg)
    ) {
      return finishSentence(state, "silence", event.now, cfg, mode);
    }
    if (
      (state.phase === "holding" || state.phase === "cuewait") &&
      state.deadline != null &&
      event.now >= state.deadline
    ) {
      return { ...state, phase: "ready", deadline: null };
    }
    return state;
  }

  return state;
}

export function isOpen(phase: Phase): boolean {
  return phase === "hearing" || phase === "holding" || phase === "cuewait" || phase === "ready";
}

export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}
