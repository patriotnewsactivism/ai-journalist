/**
 * Cadence — turn-taking for the studio floor.
 *
 * Ported from patriotnewsactivism/cadence (src/lib/cadence/engine.ts).
 * The engine is pure and dependency-free: it takes what the room just said
 * and decides whether the floor is open, how long to hold, or whether to
 * stay quiet entirely.
 *
 * Two modes:
 *   hold — measured. Wait out the beat after a finished thought, then answer.
 *   cue  — quiet. Only speak when actually addressed (wake phrase or a direct question).
 */

import {
  DEFAULT_SETTINGS,
  initialEngine,
  reduce,
  type EngineState,
  type Settings,
  type TalkMode,
} from "./engine";

export * from "./engine";

export type TurnDecision = {
  /** Whether the anchor should take the floor at all. */
  speak: boolean;
  /** How long to hold before speaking, in ms. */
  waitMs: number;
  /** Human-readable reason, shown in the desk log. */
  reason: string;
  /** Set when the line was a voice command to change modes. */
  switchTo: TalkMode | null;
  /** The Cadence phase the turn landed in. */
  phase: EngineState["phase"];
};

export type GateConfig = {
  mode: TalkMode;
  /** Silence that closes a thought when there's no punctuation. */
  silenceMs: number;
  /** Extra wait after the thought ends, before Measured Hold speaks. */
  holdMs: number;
  /** Short pause after a cue, before Quiet Cue speaks. */
  cuePauseMs: number;
  /** Carried over from a pause the room talked through. */
  learnedMs: number;
};

export function modeLabel(mode: TalkMode): string {
  return mode === "hold" ? "Measured Hold" : "Quiet Cue";
}

/**
 * Decide a single turn from a finished transcript.
 *
 * The studio's ear produces one transcript per take, so the engine is driven
 * with a final hypothesis followed by a force-end. That reproduces exactly
 * what Cadence does live: a terminal "." ends the thought on punctuation, and
 * anything else is judged by whether it *looks* finished.
 */
export function decideTurn(text: string, cfg: GateConfig, now = 0): TurnDecision {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    mode: cfg.mode,
    silenceMs: cfg.silenceMs,
    holdMs: cfg.holdMs,
    cuePauseMs: cfg.cuePauseMs,
    learnedMs: cfg.learnedMs,
  };

  const trimmed = text.trim();
  if (!trimmed) {
    return {
      speak: false,
      waitMs: 0,
      reason: "Nothing was said.",
      switchTo: null,
      phase: "idle",
    };
  }

  let state = initialEngine();
  state = reduce(state, { type: "hypothesis", text: trimmed, now, final: true }, settings, cfg.mode);
  state = reduce(state, { type: "force-end", now }, settings, cfg.mode);

  if (state.switchTo) {
    return {
      speak: false,
      waitMs: 0,
      reason: `Heard a mode command. Switching to ${modeLabel(state.switchTo)}.`,
      switchTo: state.switchTo,
      phase: state.phase,
    };
  }

  if (state.phase === "suppressed") {
    return {
      speak: false,
      waitMs: 0,
      reason: state.reason ?? "Staying quiet.",
      switchTo: null,
      phase: state.phase,
    };
  }

  if (state.phase === "holding" || state.phase === "cuewait") {
    const waitMs = state.deadline != null ? Math.max(0, state.deadline - now) : 0;
    return {
      speak: true,
      waitMs,
      reason:
        state.phase === "holding"
          ? `Measured Hold — answering after the ${Math.round(waitMs)}ms beat.`
          : `Cued — answering after a short ${Math.round(waitMs)}ms pause.`,
      switchTo: null,
      phase: state.phase,
    };
  }

  if (state.phase === "ready") {
    return {
      speak: true,
      waitMs: 0,
      reason: "Floor is open.",
      switchTo: null,
      phase: state.phase,
    };
  }

  return {
    speak: false,
    waitMs: 0,
    reason: state.reason ?? "Not a finished thought.",
    switchTo: null,
    phase: state.phase,
  };
}
