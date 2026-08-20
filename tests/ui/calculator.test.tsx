import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Calculator } from '@/src/ui/views/Calculator';
import { Popup } from '@/entrypoints/popup/Popup';
import { setStorageArea, STORAGE_KEYS, type StorageArea } from '@/src/lib/storage/store';

/** Wraps the controlled calculator so a test can type into it. */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <Calculator value={value} onChange={setValue} />;
}

function memoryArea(seed: Record<string, unknown> = {}): StorageArea {
  const data = new Map<string, unknown>(Object.entries(seed));
  return {
    async get(key) {
      return data.get(key);
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

beforeEach(() => {
  setStorageArea(memoryArea());
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  setStorageArea(undefined);
  vi.restoreAllMocks();
});

const headline = (text: string) =>
  screen.getByText(text, { selector: '.nc-calc__network' });

const stepperValue = () =>
  screen.getByText(/^\//, { selector: '.nc-stepper__value' }).textContent;

const typeInto = (text: string) => {
  const input = screen.getByLabelText(/IP address or CIDR block/i);
  fireEvent.input(input, { target: { value: text } });
  return input as HTMLInputElement;
};

describe('Calculator (F1)', () => {
  it('starts with an empty state', () => {
    render(<Harness />);
    expect(screen.getByText(/Type an address to see its network/i)).toBeInTheDocument();
  });

  it('calculates an IPv4 block (FR-CALC-02)', async () => {
    render(<Harness />);
    typeInto('192.168.1.37/24');

    await waitFor(() => expect(headline('192.168.1.0')).toBeInTheDocument());
    expect(screen.getByLabelText(/Copy Subnet mask: 255\.255\.255\.0/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Copy Wildcard mask: 0\.0\.0\.255/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Copy Broadcast address: 192\.168\.1\.255/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Copy Usable addresses: 254/i)).toBeInTheDocument();
    expect(screen.getByText('Private (RFC 1918)')).toBeInTheDocument();
  });

  it('renders the bit ruler with a marked boundary', async () => {
    render(<Harness />);
    typeInto('10.0.0.0/8');

    const ruler = await screen.findByLabelText('Bit ruler');
    expect(ruler.querySelectorAll('li')).toHaveLength(32);
    expect(ruler.querySelectorAll('li.is-network')).toHaveLength(8);
    expect(ruler.querySelectorAll('li.is-boundary')).toHaveLength(1);
  });

  it('calculates an IPv6 block and never calls the last address a broadcast (FR-CALC-03)', async () => {
    render(<Harness />);
    typeInto('2001:db8::1/48');

    await waitFor(() => expect(screen.getByText('Canonical form')).toBeInTheDocument());
    expect(screen.getByText('Last address')).toBeInTheDocument();
    expect(screen.queryByText('Broadcast address')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Group ruler')).toBeInTheDocument();
  });

  it('shows a friendly error and clears it when the input becomes valid', async () => {
    render(<Harness />);
    typeInto('999.1.1.1');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/0 to 255/));

    typeInto('10.0.0.0/8');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('retunes the prefix in place (FR-CALC-06)', async () => {
    render(<Harness initial="192.168.1.37/24" />);
    await waitFor(() => expect(headline('192.168.1.0')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Widen the block'));
    await waitFor(() => expect(headline('192.168.0.0')).toBeInTheDocument());
    expect(stepperValue()).toBe('/23');

    fireEvent.input(screen.getByLabelText('Prefix length'), { target: { value: '16' } });
    await waitFor(() => expect(stepperValue()).toBe('/16'));
  });

  it('copies a value to the clipboard (FR-CALC-05)', async () => {
    render(<Harness initial="10.0.0.0/8" />);
    const button = await screen.findByLabelText(/Copy Subnet mask: 255\.0\.0\.0/i);
    fireEvent.click(button);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('255.0.0.0'));
  });

  it('copies the whole result as Markdown', async () => {
    render(<Harness initial="10.0.0.0/8" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy as Markdown' }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const [markdown] = vi.mocked(navigator.clipboard.writeText).mock.calls[0] as [string];
    expect(markdown).toContain('| Network address | 10.0.0.0 |');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows the §4.4 note for a /31', async () => {
    render(<Harness initial="198.51.100.6/31" />);
    await waitFor(() =>
      expect(screen.getByText(/RFC 3021 point-to-point/i)).toBeInTheDocument(),
    );
  });
});

describe('Popup', () => {
  it('restores the last input from storage (FR-CALC-07)', async () => {
    setStorageArea(memoryArea({ [STORAGE_KEYS.calcLast]: '172.16.0.0/12' }));
    render(<Popup version="9.9.9" />);

    const input = await screen.findByDisplayValue('172.16.0.0/12');
    expect(input).toBeInTheDocument();
    await waitFor(() => expect(headline('172.16.0.0')).toBeInTheDocument());
  });

  it('shows the version and a link to the full app (FR-CALC-08)', () => {
    render(<Popup version="9.9.9" />);
    expect(screen.getByText('v9.9.9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open the full app/i })).toBeInTheDocument();
  });

  it('opens the app carrying the current input', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(<Popup version="9.9.9" />);

    typeInto('10.20.0.0/16');
    fireEvent.click(screen.getByRole('button', { name: /Open the full app/i }));

    expect(open).toHaveBeenCalledWith('app.html#/calc?q=10.20.0.0%2F16', '_blank');
    vi.unstubAllGlobals();
  });
});

describe('the converter link', () => {
  it('is offered in the full app', async () => {
    render(<Harness initial="10.0.0.0/8" />);
    expect(await screen.findByRole('link', { name: /Open in converter/ })).toBeInTheDocument();
  });

  it('is left out of the popup, where it would crowd the headline', async () => {
    render(<Popup version="9.9.9" />);
    typeInto('10.0.0.0/8');
    await waitFor(() => expect(headline('10.0.0.0')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /Open in converter/ })).not.toBeInTheDocument();
  });
});
