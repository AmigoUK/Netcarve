import { useMemo, useState } from 'preact/hooks';
import { errorMessage, strings } from '../../strings';
import { toggleBit } from '../../lib/numeric/bitwise';
import {
  BIT_WIDTHS,
  parseNumeric,
  toAddressForm,
  toBinary,
  toDecimal,
  toHex,
  widthsFor,
  type BitWidth,
  type NumericForm,
  type NumericValue,
} from '../../lib/numeric/value';
import { BitField } from '../components/BitField';
import { Copyable } from '../components/Copyable';

interface ToolsProps {
  /** Seeded once from `#/tools?v=…&w=…`. */
  initialValue?: string;
  initialWidth?: BitWidth;
}

const SECTIONS = [
  { id: 'nc-converter', label: strings.tools.index.converter },
] as const;

export function Tools({ initialValue = '', initialWidth }: ToolsProps) {
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

      <section class="nc-panel nc-section" id="nc-converter">
        <h2 class="nc-subtitle">{strings.tools.converterTitle}</h2>

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
            <dl class="nc-values">
              {rowsFor(value).map((row) => (
                <div class="nc-values__row" key={row.label}>
                  <dt class="nc-label">{row.label}</dt>
                  <dd>
                    <Copyable value={row.value} label={row.label} />
                  </dd>
                </div>
              ))}
            </dl>
            <BitField value={value} label={strings.tools.bitsLabel} onToggle={setBit} />
          </>
        )}
      </section>
    </div>
  );
}

function formLabel(form: NumericForm): string {
  return strings.tools.forms[form];
}

interface Row {
  readonly label: string;
  readonly value: string;
}

/** The rows the converter shows, in the order it shows them. Also drives the exports. */
export function rowsFor(value: NumericValue): Row[] {
  const rows: Row[] = [
    { label: strings.tools.rows.decimal, value: toDecimal(value) },
    { label: strings.tools.rows.hex, value: toHex(value) },
    { label: strings.tools.rows.binary, value: toBinary(value) },
  ];

  const address = toAddressForm(value);
  if (address !== undefined) {
    rows.push({
      label: value.width === 32 ? strings.tools.rows.ipv4 : strings.tools.rows.ipv6,
      value: address,
    });
  }
  return rows;
}
