import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/app/App';
import { setStorageArea } from '@/src/lib/storage/store';

beforeEach(() => {
  setStorageArea({
    async get() {
      return undefined;
    },
    async set() {
      /* no-op */
    },
    async remove() {
      /* no-op */
    },
  });
  globalThis.location.hash = '#/tools';
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  setStorageArea(undefined);
  vi.restoreAllMocks();
});

const typeValue = (text: string) => {
  fireEvent.input(screen.getByLabelText('Value'), { target: { value: text } });
};

/** All three sections show the same row labels, so every query is scoped to one of them. */
const section = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`no section ${id}`);
  return element;
};

/** The row's value, read from the copy button's accessible name so it is exact. */
const rowValue = (label: string, sectionId = 'nc-converter'): string => {
  const button = within(section(sectionId)).getByLabelText(new RegExp(`^Copy ${label}:`));
  return (button.getAttribute('aria-label') ?? '').replace(`Copy ${label}: `, '');
};

const hasRow = (label: string, sectionId = 'nc-converter'): boolean =>
  within(section(sectionId)).queryByLabelText(new RegExp(`^Copy ${label}:`)) !== null;

describe('the tools page', () => {
  it('is reachable from the nav and starts empty', () => {
    render(<App version="1.2.0" />);
    expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.getByText('Type a value to see it in every base.')).toBeInTheDocument();
  });

  it('shows a dotted quad in every base', async () => {
    render(<App version="1.2.0" />);
    typeValue('192.168.1.1');

    await waitFor(() => expect(rowValue('Decimal')).toBe('3232235777'));
    expect(rowValue('Hexadecimal')).toBe('0xC0A80101');
    expect(rowValue('Binary')).toBe('11000000 10101000 00000001 00000001');
    expect(rowValue('IPv4 address')).toBe('192.168.1.1');
    expect(screen.getByText('read as a dotted quad')).toBeInTheDocument();
  });

  it('converts hexadecimal back to an address', async () => {
    render(<App version="1.2.0" />);
    typeValue('0xC0A80101');
    await waitFor(() => expect(rowValue('IPv4 address')).toBe('192.168.1.1'));
    expect(screen.getByText('read as a hexadecimal number')).toBeInTheDocument();
  });

  it('shows an IPv6 address at 128 bits with no IPv4 row', async () => {
    render(<App version="1.2.0" />);
    typeValue('2001:db8::1');

    await waitFor(() => expect(hasRow('IPv6 address')).toBe(true));
    expect(hasRow('IPv4 address')).toBe(false);
    expect(screen.getByRole('radio', { name: '128 bits' })).toBeChecked();
  });

  it('disables the widths too small to hold the value (FR-TOOL-03)', async () => {
    render(<App version="1.2.0" />);
    typeValue('192.168.1.1');

    await waitFor(() => expect(screen.getByRole('radio', { name: '8 bits' })).toBeDisabled());
    expect(screen.getByRole('radio', { name: '16 bits' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '32 bits' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: '64 bits' })).toBeEnabled();
  });

  it('re-renders every base when the width changes (FR-TOOL-01)', async () => {
    render(<App version="1.2.0" />);
    typeValue('0xFF');

    await waitFor(() => expect(screen.getByRole('radio', { name: '32 bits' })).toBeChecked());
    expect(rowValue('Binary')).toBe('00000000 00000000 00000000 11111111');

    fireEvent.click(screen.getByRole('radio', { name: '8 bits' }));
    await waitFor(() => expect(rowValue('Binary')).toBe('11111111'));
    expect(rowValue('Hexadecimal')).toBe('0xFF');
    expect(hasRow('IPv4 address')).toBe(false);
  });

  it('falls back to a natural width rather than trapping the user', async () => {
    render(<App version="1.2.0" />);
    typeValue('0xFF');
    await waitFor(() => expect(screen.getByRole('radio', { name: '32 bits' })).toBeChecked());

    fireEvent.click(screen.getByRole('radio', { name: '8 bits' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: '8 bits' })).toBeChecked());

    typeValue('192.168.1.1');
    await waitFor(() => expect(rowValue('IPv4 address')).toBe('192.168.1.1'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('flips a bit when it is clicked (FR-TOOL-06)', async () => {
    render(<App version="1.2.0" />);
    typeValue('0x00');
    await waitFor(() => expect(rowValue('Decimal')).toBe('0'));

    fireEvent.click(screen.getByRole('button', { name: 'Bit 0, value 0' }));
    await waitFor(() => expect(rowValue('Decimal')).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: 'Bit 31, value 0' }));
    await waitFor(() => expect(rowValue('Decimal')).toBe('2147483649'));
  });

  it('counts the set bits', async () => {
    render(<App version="1.2.0" />);
    typeValue('255.255.255.0');
    await waitFor(() =>
      expect(within(section('nc-converter')).getByText('24 of 32 bits set')).toBeInTheDocument(),
    );
  });

  it('explains a bare hexadecimal value rather than guessing (FR-TOOL-04)', async () => {
    render(<App version="1.2.0" />);
    typeValue('C0A8');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Prefix hexadecimal with 0x and binary with 0b/,
    );
  });

  it.each([
    ['0xZZ', /not a number NetCarve can read/],
    ['999.1.1.1', /0 to 255/],
  ])('reports %s with a friendly message', async (text, message) => {
    render(<App version="1.2.0" />);
    typeValue(text);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('copies a row to the clipboard', async () => {
    render(<App version="1.2.0" />);
    typeValue('192.168.1.1');
    await waitFor(() => expect(rowValue('Hexadecimal')).toBe('0xC0A80101'));

    fireEvent.click(within(section('nc-converter')).getByLabelText(/^Copy Hexadecimal:/));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0xC0A80101'),
    );
  });

  it('seeds itself from the URL and cleans both keys away (FR-TOOL-07)', async () => {
    globalThis.location.hash = '#/tools?v=0xFF&w=8';
    render(<App version="1.2.0" />);

    expect(await screen.findByDisplayValue('0xFF')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('radio', { name: '8 bits' })).toBeChecked());
    expect(globalThis.location.hash).toBe('#/tools');
  });

  it('ignores a width in the URL that is not one it offers', async () => {
    globalThis.location.hash = '#/tools?v=0xFF&w=99';
    render(<App version="1.2.0" />);

    expect(await screen.findByDisplayValue('0xFF')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('radio', { name: '32 bits' })).toBeChecked());
  });
});

describe('the bitwise section (FR-TOOL-05)', () => {
  const setOperand = (label: string, text: string) =>
    fireEvent.input(screen.getByLabelText(label), { target: { value: text } });

  it('masks an address with AND, the way an engineer would', async () => {
    render(<App version="1.2.0" />);
    setOperand('Operand A', '10.20.30.40');
    setOperand('Operand B', '255.255.0.0');

    await waitFor(() => expect(rowValue('Result', 'nc-bitwise')).toBe('10.20.0.0'));
  });

  it('offers OR, XOR and AND NOT', async () => {
    render(<App version="1.2.0" />);
    setOperand('Operand A', '0x0F');
    setOperand('Operand B', '0xF0');

    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'or' } });
    await waitFor(() => expect(rowValue('Hexadecimal', 'nc-bitwise')).toBe('0x000000FF'));

    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'xor' } });
    await waitFor(() => expect(rowValue('Hexadecimal', 'nc-bitwise')).toBe('0x000000FF'));

    setOperand('Operand B', '0x0C');
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'andnot' } });
    await waitFor(() => expect(rowValue('Hexadecimal', 'nc-bitwise')).toBe('0x00000003'));
  });

  it('turns a mask into its wildcard with NOT, and hides the second operand', async () => {
    render(<App version="1.2.0" />);
    setOperand('Operand A', '255.255.255.0');
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'not' } });

    await waitFor(() => expect(rowValue('Result', 'nc-bitwise')).toBe('0.0.0.255'));
    expect(screen.queryByLabelText('Operand B')).not.toBeInTheDocument();
  });

  it('shifts, truncating at the width', async () => {
    render(<App version="1.2.0" />);
    setOperand('Operand A', '0x01');
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'shl' } });
    fireEvent.input(screen.getByLabelText('Shift by'), { target: { value: '24' } });

    await waitFor(() => expect(rowValue('Hexadecimal', 'nc-bitwise')).toBe('0x01000000'));

    fireEvent.input(screen.getByLabelText('Shift by'), { target: { value: '32' } });
    await waitFor(() => expect(rowValue('Hexadecimal', 'nc-bitwise')).toBe('0x00000000'));
  });

  it('reports an operand it cannot read', async () => {
    render(<App version="1.2.0" />);
    setOperand('Operand A', 'nonsense!');
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a number NetCarve can read/);
  });
});

describe('the masks section', () => {
  it('converts a prefix to a mask', async () => {
    render(<App version="1.2.0" />);
    fireEvent.input(screen.getByLabelText('Prefix length'), { target: { value: '26' } });
    await waitFor(() => expect(screen.getByDisplayValue('255.255.255.192')).toBeInTheDocument());
    expect(rowValue('Wildcard mask', 'nc-masks')).toBe('0.0.0.63');
  });

  it('converts a mask back to a prefix', async () => {
    render(<App version="1.2.0" />);
    fireEvent.input(screen.getByLabelText('Subnet mask'), { target: { value: '255.255.240.0' } });
    await waitFor(() => expect(screen.getByDisplayValue('20')).toBeInTheDocument());
  });

  it('refuses a mask that is not contiguous', async () => {
    render(<App version="1.2.0" />);
    fireEvent.input(screen.getByLabelText('Subnet mask'), { target: { value: '255.0.255.0' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /run of ones followed only by zeros/,
    );
  });
});

describe('the converter export', () => {
  it('copies the whole table', async () => {
    render(<App version="1.2.0" />);
    typeValue('192.168.1.1');
    await waitFor(() => expect(rowValue('Decimal')).toBe('3232235777'));

    fireEvent.click(screen.getByRole('button', { name: 'Copy as Markdown' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());

    const [markdown] = vi.mocked(navigator.clipboard.writeText).mock.calls[0] as [string];
    expect(markdown).toContain('| Decimal | 3232235777 |');
    expect(markdown).toContain('| Hexadecimal | 0xC0A80101 |');
    expect(markdown).toContain('| IPv4 address | 192.168.1.1 |');
  });
});

describe('the calculator cross-link (FR-TOOL-07)', () => {
  it('hands the network address to the converter', async () => {
    globalThis.location.hash = '#/calc';
    render(<App version="1.2.0" />);
    fireEvent.input(screen.getByLabelText('IP address or CIDR block'), {
      target: { value: '192.168.1.37/24' },
    });

    const link = await screen.findByRole('link', { name: /Open in converter/ });
    expect(link).toHaveAttribute('href', '#/tools?v=192.168.1.0&w=32');
  });
});
