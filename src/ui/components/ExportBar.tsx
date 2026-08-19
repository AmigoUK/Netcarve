import { copyText, downloadText, slugify } from '../../lib/export/download';
import { strings } from '../../strings';
import { useFlag } from '../hooks';

interface ExportBarProps {
  /** Produced lazily so a large plan is only serialised when the user asks for it. */
  markdown: () => string;
  csv?: () => string;
  json?: () => string;
  /** Used as the download file name stem. */
  name: string;
}

/** Copy-as-Markdown plus the two file downloads (FR-EXP-01…04). */
export function ExportBar({ markdown, csv, json, name }: ExportBarProps) {
  const [copied, confirm] = useFlag();
  const stem = slugify(name);

  return (
    <div class="nc-row nc-exports">
      <button
        type="button"
        class="nc-button"
        onClick={() => {
          void copyText(markdown()).then((done) => {
            if (done) confirm();
          });
        }}
      >
        {copied ? strings.common.copied : strings.common.copyAsMarkdown}
      </button>

      {csv !== undefined && (
        <button
          type="button"
          class="nc-button"
          onClick={() => downloadText(`${stem}.csv`, csv(), 'text/csv')}
        >
          {strings.exports.downloadCsv}
        </button>
      )}

      {json !== undefined && (
        <button
          type="button"
          class="nc-button"
          onClick={() => downloadText(`${stem}.json`, json(), 'application/json')}
        >
          {strings.exports.downloadJson}
        </button>
      )}
    </div>
  );
}
