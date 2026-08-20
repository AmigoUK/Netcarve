import { useMemo, useState } from 'preact/hooks';
import { errorMessage, strings } from '../../strings';
import { applyBitwise, not, shiftLeft, shiftRight, toggleBit } from '../../lib/numeric/bitwise';
import { maskToPrefix, prefixToMask } from '../../lib/numeric/mask';
import {
  BIT_WIDTHS,
  parseNumeric,
  toAddressForm,
  toHex,
  widthsFor,
  type BitWidth,
  type NumericForm,
  type NumericValue,
} from '../../lib/numeric/value';
import { converterRows, converterToMarkdown, converterToPlain } from '../../lib/export/converter';
import type { CopyFormat } from '../../lib/storage/settings';
import { BitField } from '../components/BitField';
import { Copyable } from '../components/Copyable';
import { ExportBar } from '../components/ExportBar';

interface ToolsProps {
  /** Seeded once from `#/tools?v=…&w=…`. */
  initialValue?: string;
  initialWidth?: BitWidth;
  exportFooter?: boolean;
  copyFormat?: CopyFormat;
}

const SECTIONS = [
  { id: 'nc-converter', label: strings.tools.index.converter },
  { id: 'nc-bitwise', label: strings.tools.index.bitwise },
  { id: 'nc-masks', label: strings.tools.index.masks },
] as const;

export function Tools({
  initialValue = '',
  initialWidth,
  exportFooter = true,
  copyFormat = 'markdown',
}: ToolsProps) {
  return (
    <div class="nc-stack">
      <header class="nc-tools__head">
        <div>
          <h1 class="nc-title">{strings.tools.title}</h1>
          <p class="nc-hint">{strings.tools.subtitle}</p>
        </div>
        <nav class="nc-tools__index" aria-label={strings.tools.jumpTo}>
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              class="nc-button nc-button--quiet"
              onClick={() => document.getElementById(section.id)?.scrollIntoView()}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </header>

      <Converter
        initialValue={initialValue}
        initialWidth={initialWidth}
        exportFooter={exportFooter}
        copyFormat={copyFormat}
      />
      <Bitwise />
      <Masks />
    </div>
  );
}

/** Rows of a value in every base, shared with the exporters. */
function ValueRows({ value }: { value: NumericValue }) {
  return (
    <dl class="nc-values">
      {converterRows(value).map((row) => (
        <div class="nc-values__row" key={row.label}>
          <dt class="nc-label">{row.label}</dt>
          <dd>
            <Copyable value={row.value} label={row.label} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formLabel(form: NumericForm): string {
  return strings.tools.forms[form];
}

// ── Base converter ──────────────────────────────────────────────────────────────

function Converter({ initialValue, initialWidth, exportFooter, copyFormat }: Required<Omit<ToolsProps, 'initialWidth'>> & { initialWidth?: BitWidth }) {
  const [text, setText] = useState(initialValue);
  const [pinnedWidth, setPinnedWidth] = useState<BitWidth | undefined>(initialWidth);

  /**
   * Parse at the pinned width, but fall back to the value's natural width when it no longer
   * fits — otherwise picking 8 bits and then typing an address would leave the panel stuck on
   * an error with no way back except clearing the field.
   */
  const outcome = useMemo(() => {
    if (text.trim() === '') return undefined;
    const pinned = parseNumeric(text, pinnedWidth);
    if (pinned.ok || pinned.code !== 'DOES_NOT_FIT') return pinned;
    return parseNumeric(text);
  }, [text, pinnedWidth]);

  const value = outcome?.ok === true ? outcome.value.value : undefined;
  const currentWidth = value?.width ?? pinnedWidth ?? 32;
  const allowed = value === undefined ? BIT_WIDTHS : widthsFor(value.value);

  const setBit = (index: number) => {
    if (value === undefined) return;
    const next = toggleBit(value, index);
    setPinnedWidth(next.width);
    setText(toHex(next));
  };

  return (
    <section class="nc-panel nc-section" id="nc-converter">
      <header class="nc-row nc-space-between">
        <h2 class="nc-subtitle">{strings.tools.converterTitle}</h2>
        {value !== undefined && (
          <ExportBar
            name="netcarve-converter"
            markdown={() => converterToMarkdown(value, exportFooter)}
            plain={() => converterToPlain(value, exportFooter)}
            copyFormat={copyFormat}
          />
        )}
      </header>

      <fieldset class="nc-fieldset">
        <legend class="nc-label">{strings.tools.widthLabel}</legend>
        <div class="nc-radios" role="radiogroup" aria-label={strings.tools.widthLabel}>
          {BIT_WIDTHS.map((width) => {
            const disabled = !allowed.includes(width);
            return (
              <label class="nc-radio" key={width}>
                <input
                  type="radio"
                  name="nc-width"
                  value={width}
                  checked={currentWidth === width}
                  disabled={disabled}
                  title={disabled ? strings.tools.widthTooSmall(width) : undefined}
                  onChange={() => setPinnedWidth(width)}
                />
                <span>{strings.tools.widthOption(width)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label class="nc-field">
        <span class="nc-label">{strings.tools.valueLabel}</span>
        <input
          class="nc-input nc-mono"
          type="text"
          autocomplete="off"
          spellcheck={false}
          value={text}
          placeholder={strings.tools.valuePlaceholder}
          aria-invalid={outcome?.ok === false ? 'true' : undefined}
          onInput={(event) => setText((event.currentTarget as HTMLInputElement).value)}
        />
      </label>

      {outcome === undefined && <p class="nc-empty">{strings.tools.empty}</p>}

      {outcome?.ok === false && (
        <p class="nc-error" role="alert">
          {errorMessage(outcome.code)}
        </p>
      )}

      {value !== undefined && outcome?.ok === true && (
        <>
          <p class="nc-hint">{strings.tools.readAs(formLabel(outcome.value.form))}</p>
          <ValueRows value={value} />
          <BitField value={value} label={strings.tools.bitsLabel} onToggle={setBit} />
        </>
      )}
    </section>
  );
}

// ── Bitwise ─────────────────────────────────────────────────────────────────────

type PanelOp = 'and' | 'or' | 'xor' | 'andnot' | 'not' | 'shl' | 'shr';
const PANEL_OPS: readonly PanelOp[] = ['and', 'or', 'xor', 'andnot', 'not', 'shl', 'shr'];
/** A type predicate, so the compiler narrows `op` to a two-operand op after the guard. */
const isShift = (op: PanelOp): op is 'shl' | 'shr' => op === 'shl' || op === 'shr';

function Bitwise() {
  const [aText, setAText] = useState('10.0.0.1');
  const [bText, setBText] = useState('255.255.0.0');
  const [op, setOp] = useState<PanelOp>('and');
  const [by, setBy] = useState('8');

  /**
   * Operand A settles the width, and B is read at that same width — the "one width per panel"
   * rule (FR-TOOL-05), so `applyBitwise` can never see a mismatch from here.
   */
  const outcome = useMemo(() => {
    const a = parseNumeric(aText);
    if (!a.ok) return a;
    const left = a.value.value;

    if (op === 'not') return { ok: true as const, value: not(left) };
    if (isShift(op)) {
      const places = Number(by === '' ? 0 : by);
      return {
        ok: true as const,
        value: op === 'shl' ? shiftLeft(left, places) : shiftRight(left, places),
      };
    }

    const b = parseNumeric(bText, left.width);
    if (!b.ok) return b;
    return applyBitwise(op, left, b.value.value);
  }, [aText, bText, op, by]);

  const result = outcome.ok ? outcome.value : undefined;

  return (
    <section class="nc-panel nc-section" id="nc-bitwise">
      <h2 class="nc-subtitle">{strings.tools.bitwiseTitle}</h2>
      <p class="nc-hint">{strings.tools.bitwiseHint}</p>

      <div class="nc-row nc-operands">
        <label class="nc-field nc-field--grow">
          <span class="nc-label">{strings.tools.operandA}</span>
          <input
            class="nc-input nc-input--small nc-mono"
            type="text"
            autocomplete="off"
            spellcheck={false}
            value={aText}
            onInput={(event) => setAText((event.currentTarget as HTMLInputElement).value)}
          />
        </label>

        <label class="nc-field">
          <span class="nc-label">{strings.tools.operation}</span>
          <select
            class="nc-select"
            value={op}
            onChange={(event) => setOp((event.currentTarget as HTMLSelectElement).value as PanelOp)}
          >
            {PANEL_OPS.map((candidate) => (
              <option value={candidate} key={candidate}>
                {strings.tools.ops[candidate]}
              </option>
            ))}
          </select>
        </label>

        {isShift(op) && (
          <label class="nc-field">
            <span class="nc-label">{strings.tools.shiftBy}</span>
            <input
              class="nc-input nc-input--small nc-mono nc-input--hosts"
              type="number"
              min={0}
              value={by}
              onInput={(event) => setBy((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        )}

        {op !== 'not' && !isShift(op) && (
          <label class="nc-field nc-field--grow">
            <span class="nc-label">{strings.tools.operandB}</span>
            <input
              class="nc-input nc-input--small nc-mono"
              type="text"
              autocomplete="off"
              spellcheck={false}
              value={bText}
              onInput={(event) => setBText((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        )}
      </div>

      {!outcome.ok && (
        <p class="nc-error" role="alert">
          {errorMessage(outcome.code)}
        </p>
      )}

      {result !== undefined && (
        <>
          <div class="nc-values__row nc-result-row">
            <span class="nc-label">{strings.tools.result}</span>
            <Copyable
              value={toAddressForm(result) ?? toHex(result)}
              label={strings.tools.result}
            />
          </div>
          <ValueRows value={result} />
          <BitField value={result} label={strings.tools.bitsLabel} />
        </>
      )}
    </section>
  );
}

// ── Masks and prefixes ──────────────────────────────────────────────────────────

const MASK_WIDTH: BitWidth = 32;

function Masks() {
  const [maskText, setMaskText] = useState('255.255.255.0');

  const outcome = useMemo(() => {
    const parsed = parseNumeric(maskText, MASK_WIDTH);
    if (!parsed.ok) return parsed;
    const prefix = maskToPrefix(parsed.value.value);
    if (!prefix.ok) return prefix;
    return { ok: true as const, value: { mask: parsed.value.value, prefix: prefix.value } };
  }, [maskText]);

  const setPrefix = (raw: string) => {
    const prefix = Number(raw === '' ? 0 : raw);
    const mask = prefixToMask(prefix, MASK_WIDTH);
    setMaskText(toAddressForm(mask) ?? toHex(mask));
  };

  return (
    <section class="nc-panel nc-section" id="nc-masks">
      <h2 class="nc-subtitle">{strings.tools.masksTitle}</h2>
      <p class="nc-hint">{strings.tools.masksHint}</p>

      <div class="nc-row nc-operands">
        <label class="nc-field">
          <span class="nc-label">{strings.tools.prefixLabel}</span>
          <input
            class="nc-input nc-input--small nc-mono nc-input--hosts"
            type="number"
            min={0}
            max={MASK_WIDTH}
            value={outcome.ok ? String(outcome.value.prefix) : ''}
            onInput={(event) => setPrefix((event.currentTarget as HTMLInputElement).value)}
          />
        </label>

        <label class="nc-field nc-field--grow">
          <span class="nc-label">{strings.tools.maskLabel}</span>
          <input
            class="nc-input nc-input--small nc-mono"
            type="text"
            autocomplete="off"
            spellcheck={false}
            value={maskText}
            aria-invalid={outcome.ok ? undefined : 'true'}
            onInput={(event) => setMaskText((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
      </div>

      {!outcome.ok && (
        <p class="nc-error" role="alert">
          {errorMessage(outcome.code)}
        </p>
      )}

      {outcome.ok && (
        <>
          <dl class="nc-values">
            <div class="nc-values__row">
              <dt class="nc-label">{strings.tools.wildcardLabel}</dt>
              <dd>
                <Copyable
                  value={toAddressForm(not(outcome.value.mask)) ?? ''}
                  label={strings.tools.wildcardLabel}
                />
              </dd>
            </div>
          </dl>
          <BitField value={outcome.value.mask} label={strings.tools.bitsLabel} />
        </>
      )}
    </section>
  );
}
