import { useRef } from 'preact/hooks';
import { parseProjectJson } from '../../lib/export/json';
import type { Project } from '../../lib/plan/model';
import { strings } from '../../strings';

interface ImportButtonProps {
  onImported: (projects: Project[]) => void;
  onError: (message: string) => void;
}

/** Restores a NetCarve JSON export (FR-EXP-03). Unknown schema versions are refused. */
export function ImportButton({ onImported, onError }: ImportButtonProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" class="nc-button" onClick={() => input.current?.click()}>
        {strings.projects.importJson}
      </button>
      <input
        ref={input}
        class="nc-visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label={strings.exports.importLabel}
        onChange={(event) => {
          const element = event.currentTarget as HTMLInputElement;
          const file = element.files?.[0];
          element.value = '';
          if (file === undefined) return;
          void file.text().then((text) => {
            const result = parseProjectJson(text);
            if (result.ok) onImported(result.projects);
            else onError(result.message);
          });
        }}
      />
    </>
  );
}
