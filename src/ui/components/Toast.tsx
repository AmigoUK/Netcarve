import { useEffect } from 'preact/hooks';

export interface ToastMessage {
  readonly id: number;
  readonly text: string;
  readonly tone: 'info' | 'error';
}

interface ToastProps {
  message: ToastMessage | undefined;
  onDismiss: () => void;
  duration?: number;
}

/** A non-blocking notice — used for storage failures and export confirmations (FR-STOR-02). */
export function Toast({ message, onDismiss, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (message === undefined) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (message === undefined) return null;

  return (
    <div
      class={`nc-toast${message.tone === 'error' ? ' nc-toast--error' : ''}`}
      role="status"
      aria-live="polite"
    >
      {message.text}
    </div>
  );
}
