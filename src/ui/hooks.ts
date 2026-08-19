import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/** Debounce for keystroke-driven work. FR-CALC-01 caps the calculator at 150 ms. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * A boolean that flips to `true` for `duration` and back — the "Copied" confirmation
 * (FR-EXP-04). Any pending reset is cleared when the component unmounts.
 */
export function useFlag(duration = 1400): [boolean, () => void] {
  const [flagged, setFlagged] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const raise = useCallback(() => {
    setFlagged(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlagged(false), duration);
  }, [duration]);

  return [flagged, raise];
}
