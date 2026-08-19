import { useMemo, useState } from 'preact/hooks';
import { checkConflicts } from '../../lib/conflict/checker';
import { conflictsToMarkdown } from '../../lib/export/markdown';
import { conflictsToPlain } from '../../lib/export/plain';
import type { CopyFormat } from '../../lib/storage/settings';
import { strings } from '../../strings';
import { ExportBar } from '../components/ExportBar';

interface ConflictsProps {
  exportFooter: boolean;
  copyFormat: CopyFormat;
}

/** The conflict checker (F5) — a paste box and a report that updates as you type. */
export function Conflicts({ exportFooter, copyFormat }: ConflictsProps) {
  const [text, setText] = useState('');
  const report = useMemo(() => checkConflicts(text), [text]);
  const hasInput = report.entries.length > 0 || report.errors.length > 0;

  return (
    <div class="nc-stack">
      <header>
        <h1 class="nc-title">{strings.conflicts.title}</h1>
        <p class="nc-hint">{strings.conflicts.subtitle}</p>
      </header>

      <section class="nc-panel nc-section">
        <label class="nc-field">
          <span class="nc-label">{strings.conflicts.inputLabel}</span>
          <textarea
            class="nc-textarea"
            value={text}
            placeholder={strings.conflicts.placeholder}
            spellcheck={false}
            onInput={(event) => setText((event.currentTarget as HTMLTextAreaElement).value)}
          />
        </label>
        <p class="nc-hint">{strings.conflicts.familyNote}</p>
      </section>

      {!hasInput && <p class="nc-empty">{strings.conflicts.empty}</p>}

      {hasInput && (
        <section class="nc-panel nc-section">
          <header class="nc-row nc-space-between">
            <h2 class="nc-subtitle">{strings.conflicts.title}</h2>
            <ExportBar
              name="netcarve-conflicts"
              markdown={() => conflictsToMarkdown(report, exportFooter)}
              plain={() => conflictsToPlain(report, exportFooter)}
              copyFormat={copyFormat}
            />
          </header>

          {report.clean ? (
            <p class="nc-result nc-result--clean" role="status">
              {strings.conflicts.clean(report.blockCount)}
            </p>
          ) : (
            <>
              {report.identical.length > 0 && (
                <div>
                  <span class="nc-label">{strings.conflicts.identical}</span>
                  <ul class="nc-findings">
                    {report.identical.map((group) => (
                      <li key={group.cidr}>
                        <code class="nc-mono">{group.cidr}</code>
                        <span class="nc-hint"> lines {group.lines.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.containment.length > 0 && (
                <div>
                  <span class="nc-label">{strings.conflicts.containment}</span>
                  <ul class="nc-findings">
                    {report.containment.map((chain) => (
                      <li key={chain.blocks.map((block) => block.cidr).join('>')}>
                        {chain.blocks.map((block, index) => (
                          <span key={block.cidr}>
                            {index > 0 && <span class="nc-findings__arrow"> ⊃ </span>}
                            <code class="nc-mono">{block.cidr}</code>
                            <span class="nc-hint"> (line {block.line})</span>
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p class="nc-hint">{strings.conflicts.alignmentNote}</p>
            </>
          )}

          {report.errors.length > 0 && (
            <div>
              <span class="nc-label">{strings.conflicts.invalidLines(report.errors.length)}</span>
              <ul class="nc-findings nc-findings--errors">
                {report.errors.map((error) => (
                  <li key={error.line}>
                    {strings.conflicts.lineError(error.line, error.text, error.message)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
