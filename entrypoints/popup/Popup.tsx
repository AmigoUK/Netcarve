import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createDebouncedWriter, readRaw, STORAGE_KEYS } from '@/src/lib/storage/store';
import { strings } from '@/src/strings';
import { openApp } from '@/src/ui/appUrl';
import { useSettings } from '@/src/ui/theme';
import { Calculator } from '@/src/ui/views/Calculator';

interface PopupProps {
  version: string;
}

/**
 * The toolbar popup: the quick calculator, nothing else. It restores the last input
 * (FR-CALC-07) and hands whatever is in the box to the full app (FR-CALC-08).
 */
export function Popup({ version }: PopupProps) {
  const [value, setValue] = useState('');
  const { settings } = useSettings();
  const writer = useMemo(() => createDebouncedWriter(STORAGE_KEYS.calcLast), []);
  const restored = useRef(false);

  useEffect(() => {
    let live = true;
    void readRaw(STORAGE_KEYS.calcLast).then((stored) => {
      if (!live) return;
      if (typeof stored === 'string') setValue(stored);
      restored.current = true;
    });
    return () => {
      live = false;
      void writer.flush();
    };
  }, [writer]);

  useEffect(() => {
    if (restored.current) writer.queue(value);
  }, [value, writer]);

  return (
    <div class="nc-popup">
      <header class="nc-popup__head">
        <span class="nc-popup__mark">
          <span class="nc-popup__mark-name">{strings.app.name}</span>
          <span class="nc-mono nc-popup__mark-version">{strings.app.version(version)}</span>
        </span>
        <button
          type="button"
          class="nc-button nc-button--quiet"
          onClick={() => openApp(`/calc?q=${encodeURIComponent(value)}`)}
        >
          {strings.app.openApp} ↗
        </button>
      </header>

      <main class="nc-popup__body">
        <Calculator
          value={value}
          onChange={setValue}
          compact
          exportFooter={settings.exportFooter}
          copyFormat={settings.defaultCopyFormat}
        />
      </main>
    </div>
  );
}
