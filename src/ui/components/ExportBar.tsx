import type { CopyFormat } from '../../lib/storage/settings';
import { copyText, downloadText, slugify } from '../../lib/export/download';
import { strings } from '../../strings';
import { useFlag } from '../hooks';

interface ExportBarProps {
  /** Produced lazily so a large plan is only serialised when the user asks for it. */
  markdown: () => string;
  /** The same content without the Markdown syntax; used when Settings asks for plain text. */
  plain?: () => string;
  csv?: () => string;
  json?: () => string;
  /** Used as the download file name stem. */
  name: string;
  /** The Settings default; decides what the copy button produces and what it is called. */
  copyFormat?: CopyFormat;
}

/** The copy button plus the two file downloads (FR-EXP-01…04). */
export function ExportBar({
  markdown,
  plain,
  csv,
  json,
  name,
  copyFormat = 'markdown',
}: ExportBarProps) {
  const [copied, confirm] = useFlag();
  const stem = slugify(name);
  const asPlain = copyFormat === 'plain' && plain !== undefined;
  const render = asPlain ? plain : markdown;
  const label = asPlain ? strings.common.copyAsText : strings.common.copyAsMarkdown;

  return (
    <div class="nc-row nc-exports">
      <button
        type="button"
        class="nc-button"
        onClick={() => {
          void copyText(render()).then((done) => {
            if (done) confirm();
          });
        }}
      >
        {copied ? strings.common.copied : label}
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
