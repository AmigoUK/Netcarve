import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
  type ThemePreference,
} from '../lib/storage/settings';

/**
 * Applies the theme choice to the document root. `auto` removes the attribute so the
 * `prefers-color-scheme` rules in `tokens.css` take over again.
 */
export function applyTheme(theme: ThemePreference, root?: HTMLElement): void {
  const element = root ?? document.documentElement;
  if (theme === 'auto') {
    element.removeAttribute('data-theme');
  } else {
    element.setAttribute('data-theme', theme);
  }
}

export interface SettingsHandle {
  settings: Settings;
  /** True once the stored settings have been read. */
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
}

/** Loads settings, keeps the theme applied, and persists every change. */
export function useSettings(): SettingsHandle {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void loadSettings().then((stored) => {
      if (!live) return;
      setSettings(stored);
      applyTheme(stored.theme);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      applyTheme(next.theme);
      void saveSettings(next);
      return next;
    });
  }, []);

  return { settings, ready, update };
}
