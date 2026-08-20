import { describe, expect, it } from 'vitest';
import {
  applyBitwise,
  BITWISE_OPS,
  not,
  popCount,
  shiftLeft,
  shiftRight,
  toggleBit,
  type BitwiseOp,
} from '@/src/lib/numeric/bitwise';
import type { BitWidth, NumericValue } from '@/src/lib/numeric/value';

const at = (value: bigint, width: BitWidth = 8): NumericValue => ({ value, width });

function result(op: BitwiseOp, a: NumericValue, b: NumericValue): bigint {
  const outcome = applyBitwise(op, a, b);
  if (!outcome.ok) throw new Error(`expected ${op} to succeed, got ${outcome.code}`);
  return outcome.value.value;
}

describe('applyBitwise', () => {
  it('offers exactly the four two-operand operations', () => {
    expect(BITWISE_OPS).toEqual(['and', 'or', 'xor', 'andnot']);
  });

  it.each<[BitwiseOp, bigint, bigint, bigint]>([
    ['and', 0b1100n, 0b1010n, 0b1000n],
    ['or', 0b1100n, 0b1010n, 0b1110n],
    ['xor', 0b1100n, 0b1010n, 0b0110n],
    ['andnot', 0b1100n, 0b1010n, 0b0100n],
    ['and', 0xffn, 0x00n, 0x00n],
    ['or', 0xf0n, 0x0fn, 0xffn],
    ['xor', 0xffn, 0xffn, 0x00n],
    ['andnot', 0xffn, 0x0fn, 0xf0n],
  ])('%s', (op, a, b, expected) => {
    expect(result(op, at(a), at(b))).toBe(expected);
  });

  it('masks a network address the way an engineer would expect', () => {
    const address = at(3232235777n, 32); // 192.168.1.1
    const mask = at(4294901760n, 32); // 255.255.0.0
    expect(result('and', address, mask)).toBe(3232235520n); // 192.168.0.0
  });

  it('keeps the width of its operands', () => {
    const outcome = applyBitwise('and', at(1n, 128), at(1n, 128));
    expect(outcome.ok && outcome.value.width).toBe(128);
  });

  it('refuses mismatched widths', () => {
    const outcome = applyBitwise('and', at(1n, 8), at(1n, 16));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('WIDTH_MISMATCH');
  });
});

describe('not', () => {
  it.each<[bigint, BitWidth, bigint]>([
    [0x00n, 8, 0xffn],
    [0xffn, 8, 0x00n],
    [0b1010_1010n, 8, 0b0101_0101n],
    [0xffn, 32, 0xffffff00n],
    [0n, 128, 2n ** 128n - 1n],
  ])('complements %s at %i bits', (value, width, expected) => {
    expect(not(at(value, width)).value).toBe(expected);
  });

  it('turns a mask into its wildcard', () => {
    expect(not(at(4294967040n, 32)).value).toBe(255n); // 255.255.255.0 -> 0.0.0.255
  });

  it('is its own inverse', () => {
    expect(not(not(at(0b0110_1001n))).value).toBe(0b0110_1001n);
  });
});

describe('shifts', () => {
  it('drops the bits a left shift pushes past the width', () => {
    expect(shiftLeft(at(0b1000_0001n), 1).value).toBe(0b0000_0010n);
    expect(shiftLeft(at(1n), 7).value).toBe(0b1000_0000n);
  });

  it('empties the value once the shift reaches the width', () => {
    expect(shiftLeft(at(0xffn), 8).value).toBe(0n);
    expect(shiftLeft(at(0xffn), 99).value).toBe(0n);
    expect(shiftRight(at(0xffn), 8).value).toBe(0n);
    expect(shiftRight(at(0xffn), 99).value).toBe(0n);
  });

  it('shifts right logically, never arithmetically', () => {
    expect(shiftRight(at(0b1000_0000n), 7).value).toBe(1n);
    expect(shiftRight(at(0xffn, 32), 4).value).toBe(0x0fn);
  });

  it('treats a negative or fractional count as none', () => {
    expect(shiftLeft(at(1n), -3).value).toBe(1n);
    expect(shiftRight(at(2n), -3).value).toBe(2n);
    expect(shiftLeft(at(1n), 1.9).value).toBe(2n);
  });

  it('keeps the width', () => {
    expect(shiftLeft(at(1n, 128), 100).width).toBe(128);
    expect(shiftRight(at(1n, 16), 1).width).toBe(16);
  });
});

describe('popCount', () => {
  it.each<[bigint, BitWidth, number]>([
    [0n, 8, 0],
    [0xffn, 8, 8],
    [0b1010_1010n, 8, 4],
    [0xffffff00n, 32, 24],
    [2n ** 128n - 1n, 128, 128],
  ])('counts the set bits of %s', (value, width, expected) => {
    expect(popCount(at(value, width))).toBe(expected);
  });
});

describe('toggleBit', () => {
  it('counts from the most significant bit, matching the on-screen order', () => {
    expect(toggleBit(at(0n), 0).value).toBe(0b1000_0000n);
    expect(toggleBit(at(0n), 7).value).toBe(0b0000_0001n);
    expect(toggleBit(at(0n, 32), 0).value).toBe(2147483648n);
  });

  it('clears a bit that was set', () => {
    expect(toggleBit(at(0xffn), 3).value).toBe(0b1110_1111n);
  });

  it('applied twice is the identity', () => {
    for (let index = 0; index < 8; index += 1) {
      expect(toggleBit(toggleBit(at(0b0101_0101n), index), index).value).toBe(0b0101_0101n);
    }
  });

  it('ignores an index outside the width', () => {
    expect(toggleBit(at(0n), 8).value).toBe(0n);
    expect(toggleBit(at(0n), -1).value).toBe(0n);
  });

  it('keeps the width', () => {
    expect(toggleBit(at(0n, 128), 0).width).toBe(128);
  });
});
