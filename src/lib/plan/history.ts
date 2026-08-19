/**
 * A tiny undo/redo stack (FR-PLAN-09).
 *
 * Planner operations return whole new trees, so history is just a list of past values. The
 * stack is in memory and per session, and is bounded so a long editing run cannot grow
 * without limit.
 */

/** Spec minimum is 20; NetCarve keeps rather more because each entry is only a tree. */
export const HISTORY_LIMIT = 50;

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records a new state. Anything that had been undone is dropped, as usual. */
export function pushHistory<T>(history: History<T>, present: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...history.past, history.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present,
    future: [],
  };
}

/** Replaces the present without recording a step — used while a text field is being typed in. */
export function replaceHistory<T>(history: History<T>, present: T): History<T> {
  return { ...history, present };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1] as T;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0] as T;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
