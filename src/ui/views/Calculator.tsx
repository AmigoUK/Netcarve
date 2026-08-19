import { useMemo } from 'preact/hooks';
import { buildCalcResult, type CalcResult } from '../../lib/calc/result';
import { calcToMarkdown } from '../../lib/export/markdown';
import { copyText } from '../../lib/export/download';
import { bitsOf, formatAddress } from '../../lib/ip/cidr';
import { strings } from '../../strings';
import { useDebouncedValue, useFlag } from '../hooks';
import { BitRuler } from '../components/BitRuler';
import { Copyable } from '../components/Copyable';

interface CalculatorProps {
  value: string;
  onChange: (next: string) => void;
  /** The popup uses the compact layout: one column, no supporting prose. */
  compact?: boolean;
  /** Whether Markdown exports carry the NetCarve credit line. */
  exportFooter?: boolean;
}

const DEBOUNCE_MS = 150;

export function Calculator({
  value,
  onChange,
  compact = false,
  exportFooter = true,
}: CalculatorProps) {
  const debounced = useDebouncedValue(value, DEBOUNCE_MS);
  const outcome = useMemo(
    () => (debounced.trim() === '' ? undefined : buildCalcResult(debounced)),
    [debounced],
  );
  const [copiedMarkdown, confirmMarkdown] = useFlag();

  const result = outcome?.ok === true ? outcome.result : undefined;

  return (
    <div class={`nc-calc${compact ? ' nc-calc--compact' : ''}`}>
      <label class="nc-field">
        <span class="nc-label">{strings.calc.inputLabel}</span>
        <input
          class="nc-input nc-mono"
          type="text"
          inputMode="text"
          autocomplete="off"
          autocorrect="off"
          spellcheck={false}
          autofocus
          value={value}
          placeholder={strings.calc.placeholder}
          aria-describedby={outcome?.ok === false ? 'nc-calc-error' : undefined}
          aria-invalid={outcome?.ok === false ? 'true' : undefined}
          onInput={(event) => onChange((event.currentTarget as HTMLInputElement).value)}
        />
      </label>

      {outcome === undefined && <p class="nc-empty">{strings.calc.emptyState}</p>}

      {outcome?.ok === false && (
        <p class="nc-error" id="nc-calc-error" role="alert">
          {outcome.message}
        </p>
      )}

      {result !== undefined && (
        <>
          <div class="nc-calc__headline">
            <Copyable value={`${result.networkText}/${result.prefix}`} label={strings.calc.fields.network}>
              <span class="nc-calc__network">{result.networkText}</span>
              <span class="nc-calc__prefix">/{result.prefix}</span>
            </Copyable>
            <span class="nc-chip nc-mono">IPv{result.family}</span>
          </div>

          <PrefixStepper result={result} onChange={onChange} />

          <BitRuler ruler={result.ruler} family={result.family} />

          <dl class="nc-values">
            {result.fields.map((field) => (
              <div class="nc-values__row" key={field.key}>
                <dt class="nc-label">{field.label}</dt>
                <dd>
                  <Copyable value={field.value} label={field.label} mono={field.mono} />
                  {field.key === 'total' && result.total.approx !== undefined && (
                    <span class="nc-values__approx nc-mono">{result.total.approx}</span>
                  )}
                  {field.key === 'usable' && result.usable.approx !== undefined && (
                    <span class="nc-values__approx nc-mono">{result.usable.approx}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {result.specials.length > 0 && (
            <section class="nc-specials" aria-label={strings.calc.specialTitle}>
              <span class="nc-label">{strings.calc.specialTitle}</span>
              <ul class="nc-specials__list">
                {result.specials.map((match) => (
                  <li key={match.range.cidr} class="nc-badge" title={match.range.shortNote}>
                    <code class="nc-mono">{match.range.cidr}</code>
                    <span>{match.range.label}</span>
                    {match.range.deprecated === true && (
                      <span class="nc-badge__flag">{strings.calc.deprecated}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.notes.length > 0 && (
            <ul class="nc-notes">
              {result.notes.map((note) => (
                <li key={note.id}>{note.text}</li>
              ))}
            </ul>
          )}

          <div class="nc-calc__actions">
            <button
              type="button"
              class="nc-button"
              onClick={() => {
                void copyText(calcToMarkdown(result, exportFooter)).then((done) => {
                  if (done) confirmMarkdown();
                });
              }}
            >
              {copiedMarkdown ? strings.common.copied : strings.common.copyAsMarkdown}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface PrefixStepperProps {
  result: CalcResult;
  onChange: (next: string) => void;
}

/** FR-CALC-06 — retune the prefix and watch every value follow. */
function PrefixStepper({ result, onChange }: PrefixStepperProps) {
  const max = bitsOf(result.family);
  const address = formatAddress(result.cidr);
  const set = (prefix: number) => {
    onChange(`${address}/${Math.min(Math.max(prefix, 0), max)}`);
  };

  return (
    <div class="nc-stepper">
      <span class="nc-label" id="nc-prefix-label">
        {strings.calc.prefixStepper}
      </span>
      <button
        type="button"
        class="nc-stepper__button"
        aria-label={strings.calc.widen}
        disabled={result.prefix === 0}
        onClick={() => set(result.prefix - 1)}
      >
        −
      </button>
      <input
        class="nc-stepper__slider"
        type="range"
        min={0}
        max={max}
        value={result.prefix}
        aria-labelledby="nc-prefix-label"
        onInput={(event) => set(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <button
        type="button"
        class="nc-stepper__button"
        aria-label={strings.calc.narrow}
        disabled={result.prefix === max}
        onClick={() => set(result.prefix + 1)}
      >
        +
      </button>
      <output class="nc-stepper__value nc-mono">/{result.prefix}</output>
    </div>
  );
}
