import type { ComponentChildren } from 'preact';
import { copyText } from '../../lib/export/download';
import { strings } from '../../strings';
import { useFlag } from '../hooks';

interface CopyableProps {
  /** What lands on the clipboard — defaults to the rendered text. */
  value: string;
  /** Accessible description, e.g. "Network address". */
  label: string;
  mono?: boolean;
  children?: ComponentChildren;
}

/**
 * A value that copies itself when clicked (FR-CALC-05). It is a real button so keyboard
 * users get the same affordance, and it confirms in place rather than through a toast.
 */
export function Copyable({ value, label, mono = true, children }: CopyableProps) {
  const [copied, confirm] = useFlag();

  return (
    <button
      type="button"
      class={`nc-copyable${mono ? ' nc-mono' : ''}${copied ? ' is-copied' : ''}`}
      title={strings.common.copyValue(label)}
      aria-label={`${strings.common.copyValue(label)}: ${value}`}
      onClick={() => {
        void copyText(value).then((done) => {
          if (done) confirm();
        });
      }}
    >
      <span class="nc-copyable__value">{children ?? value}</span>
      <span class="nc-copyable__hint" aria-hidden="true">
        {copied ? strings.common.copied : strings.common.copy}
      </span>
    </button>
  );
}
