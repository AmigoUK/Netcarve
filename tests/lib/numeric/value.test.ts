import { describe, expect, it } from 'vitest';
import {
  BIT_WIDTHS,
  maskOfWidth,
  parseNumeric,
  toAddressForm,
  toBinary,
  toDecimal,
  toHex,
  widthsFor,
  withWidth,
  type BitWidth,
  type NumericValue,
} from '@/src/lib/numeric/value';

function parsed(text: string, width?: BitWidth) {
  const result = parseNumeric(text, width);
  if (!result.ok) throw new Error(`expected ${text} to parse, got ${result.code}`);
  return result.value;
}

const at = (value: bigint, width: BitWidth): NumericValue => ({ value, width });

describe('parseNumeric', () => {
  it.each<[string, bigint, BitWidth, string]>([
    ['192.168.1.1', 3232235777n, 32, 'dotted-quad'],
    ['0.0.0.0', 0n, 32, 'dotted-quad'],
    ['255.255.255.255', 4294967295n, 32, 'dotted-quad'],
    ['0xC0A80101', 3232235777n, 32, 'hex'],
    ['0xc0a80101', 3232235777n, 32, 'hex'],
    ['3232235777', 3232235777n, 32, 'decimal'],
    ['0', 0n, 32, 'decimal'],
    ['0b11000000101010000000000100000001', 3232235777n, 32, 'binary'],
    ['0b1100_0000', 192n, 32, 'binary'],
    ['0xC0_A8', 49320n, 32, 'hex'],
    ['2001:db8::1', 0x20010db8000000000000000000000001n, 128, 'ipv6'],
    ['::', 0n, 128, 'ipv6'],
    ['0xFF', 255n, 32, 'hex'],
    ['0xFFFFFFFFFF', 0xffffffffffn, 48, 'hex'],
    ['0xFFFFFFFFFFFFF', 0xfffffffffffffn, 64, 'hex'],
  ])('reads %s', (text, value, width, form) => {
    expect(parsed(text)).toEqual({ value: { value, width }, form });
  });

  it('trims surrounding whitespace', () => {
    expect(parsed('  0xFF  ').value).toEqual(at(255n, 32));
  });

  it.each<[string, string]>([
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['C0A8', 'MISSING_RADIX_PREFIX'],
    ['deadbeef', 'MISSING_RADIX_PREFIX'],
    ['ff', 'MISSING_RADIX_PREFIX'],
    ['0xZZ', 'BAD_DIGITS'],
    ['0x', 'BAD_DIGITS'],
    ['0b2', 'BAD_DIGITS'],
    ['0b', 'BAD_DIGITS'],
    ['-5', 'BAD_DIGITS'],
    ['12.5', 'BAD_DIGITS'],
    ['hello world', 'BAD_DIGITS'],
    ['999.1.1.1', 'BAD_OCTET'],
    ['2001:db8:::1', 'BAD_GROUP'],
  ])('rejects %s with %s', (text, code) => {
    const result = parseNumeric(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it('honours an explicit width', () => {
    expect(parsed('0xFF', 8).value).toEqual(at(255n, 8));
    expect(parsed('192.168.1.1', 64).value).toEqual(at(3232235777n, 64));
  });

  it('refuses an explicit width too small for the value', () => {
    const result = parseNumeric('0x1FF', 8);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DOES_NOT_FIT');
  });

  it('refuses a value wider than any supported width', () => {
    const result = parseNumeric(`0x${'F'.repeat(33)}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DOES_NOT_FIT');
  });

  it('never picks a width below 32 for a bare number', () => {
    expect(parsed('1').value.width).toBe(32);
    expect(parsed('0b1').value.width).toBe(32);
  });
});

describe('widths', () => {
  it('lists every width that holds the value', () => {
    expect(widthsFor(0n)).toEqual(BIT_WIDTHS);
    expect(widthsFor(255n)).toEqual(BIT_WIDTHS);
    expect(widthsFor(256n)).toEqual([16, 32, 48, 64, 128]);
    expect(widthsFor(2n ** 32n)).toEqual([48, 64, 128]);
    expect(widthsFor(2n ** 127n)).toEqual([128]);
    expect(widthsFor(2n ** 128n)).toEqual([]);
  });

  it('gives the full mask for a width', () => {
    expect(maskOfWidth(8)).toBe(255n);
    expect(maskOfWidth(32)).toBe(4294967295n);
    expect(maskOfWidth(128)).toBe(2n ** 128n - 1n);
  });

  it('widens without complaint', () => {
    const result = withWidth(at(3232235777n, 32), 64);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(at(3232235777n, 64));
  });

  it('refuses to narrow below the value', () => {
    const result = withWidth(at(3232235777n, 32), 16);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DOES_NOT_FIT');
  });

  it('narrows when the value still fits', () => {
    const result = withWidth(at(255n, 32), 8);
    expect(result.ok && result.value).toEqual(at(255n, 8));
  });
});

describe('formatting', () => {
  const value = at(3232235777n, 32);

  it('renders decimal as plain digits, so it pastes cleanly', () => {
    expect(toDecimal(value)).toBe('3232235777');
    expect(toDecimal(at(0n, 8))).toBe('0');
  });

  it('pads hexadecimal to the width', () => {
    expect(toHex(value)).toBe('0xC0A80101');
    expect(toHex(at(255n, 8))).toBe('0xFF');
    expect(toHex(at(5n, 16))).toBe('0x0005');
    expect(toHex(at(1n, 128))).toBe(`0x${'0'.repeat(31)}1`);
  });

  it('pads binary to the width and groups it in bytes', () => {
    expect(toBinary(value)).toBe('11000000 10101000 00000001 00000001');
    expect(toBinary(at(5n, 8))).toBe('00000101');
    expect(toBinary(at(0n, 16))).toBe('00000000 00000000');
  });

  it('adds an address form only where the width has one', () => {
    expect(toAddressForm(value)).toBe('192.168.1.1');
    expect(toAddressForm(at(1n, 128))).toBe('::1');
    expect(toAddressForm(at(1n, 48))).toBeUndefined();
    expect(toAddressForm(at(1n, 8))).toBeUndefined();
    expect(toAddressForm(at(1n, 16))).toBeUndefined();
    expect(toAddressForm(at(1n, 64))).toBeUndefined();
  });
});

describe('round trips', () => {
  /** A seeded generator, so a failure can always be reproduced. */
  function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  it.each([1, 2, 3, 4, 5])('survives parse ∘ format on seed %i', (seed) => {
    const random = seeded(seed);
    for (let round = 0; round < 40; round += 1) {
      const width = BIT_WIDTHS[Math.floor(random() * BIT_WIDTHS.length)] as BitWidth;
      let value = 0n;
      for (let bit = 0; bit < width; bit += 1) {
        value = (value << 1n) | (random() < 0.5 ? 0n : 1n);
      }
      const original = at(value, width);

      expect(parsed(toHex(original), width).value).toEqual(original);
      expect(parsed(toDecimal(original), width).value).toEqual(original);
      expect(parsed(`0b${toBinary(original).replace(/ /g, '')}`, width).value).toEqual(original);

      const address = toAddressForm(original);
      if (address !== undefined) {
        expect(parsed(address, width).value).toEqual(original);
      }
    }
  });
});
