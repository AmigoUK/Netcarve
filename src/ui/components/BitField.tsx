import { popCount } from '../../lib/numeric/bitwise';
import { type NumericValue } from '../../lib/numeric/value';
import { strings } from '../../strings';

interface BitFieldProps {
  value: NumericValue;
  /** Omit to render a read-only field. `index` counts from the most significant bit. */
  onToggle?: (index: number) => void;
  /** Accessible name for the whole field. */
  label: string;
}

/**
 * The value as individual bits, grouped into bytes.
 *
 * Where the calculator's `BitRuler` shows where a prefix falls, this one is an **input**: each
 * bit is a button, and clicking it flips the value (FR-TOOL-06). The two share the `--bit-*`
 * tokens so the visual language holds, and each carries its own legend saying what a filled
 * cell means.
 *
 * On screen the bits read left to right from the most significant, but they are *named* the way
 * engineers name them — the leftmost of thirty-two is bit 31. The conversion happens here, in
 * one place.
 */
export function BitField({ value, onToggle, label }: BitFieldProps) {
  const bits = value.value.toString(2).padStart(value.width, '0').split('');
  const interactive = onToggle !== undefined;

  return (
    <div class="nc-bitfield">
      <ol class="nc-bits" aria-label={label}>
        {bits.map((bit, index) => {
          const position = value.width - 1 - index;
          const className = [
            'nc-bits__cell',
            bit === '1' ? 'is-set' : '',
            index > 0 && index % 8 === 0 ? 'is-group-start' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={position}>
              {interactive ? (
                <button
                  type="button"
                  class={className}
                  aria-label={strings.tools.bitLabel(position, bit)}
                  onClick={() => onToggle(index)}
                >
                  <span class="nc-mono">{bit}</span>
                </button>
              ) : (
                <span class={className} aria-label={strings.tools.bitLabel(position, bit)}>
                  <span class="nc-mono">{bit}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p class="nc-bitfield__legend">
        {interactive && <span>{strings.tools.bitHint} </span>}
        <span class="nc-mono">{strings.tools.setBits(popCount(value), value.width)}</span>
      </p>
    </div>
  );
}
