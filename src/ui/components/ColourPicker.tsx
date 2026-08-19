import { PALETTE, type PaletteToken } from '../../lib/plan/model';
import { strings } from '../../strings';

interface ColourPickerProps {
  value: PaletteToken | undefined;
  onChange: (colour: PaletteToken | undefined) => void;
  id?: string;
}

const LABELS: Record<PaletteToken, string> = {
  blue: 'Blue',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  violet: 'Violet',
  teal: 'Teal',
  pink: 'Pink',
  grey: 'Grey',
};

/**
 * A swatch grid — never a text field. Clicking the selected swatch clears it, so a block can
 * go back to having no colour without a separate control.
 */
export function ColourPicker({ value, onChange, id }: ColourPickerProps) {
  return (
    <div class="nc-swatches" role="radiogroup" aria-label={strings.planner.colourLabel} id={id}>
      {PALETTE.map((token) => {
        const selected = value === token;
        return (
          <button
            key={token}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LABELS[token]}
            title={LABELS[token]}
            class={`nc-swatch nc-swatch--${token}${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(selected ? undefined : token)}
          />
        );
      })}
    </div>
  );
}
