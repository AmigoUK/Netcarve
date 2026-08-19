import { describe, expect, it } from 'vitest';
import { buildCalcResult, withPrefix, type CalcResult } from '@/src/lib/calc/result';
import { calcToMarkdown } from '@/src/lib/export/markdown';
import { formatCount, formatPercent, groupDigits, scientific, superscript } from '@/src/lib/format';

function ok(input: string): CalcResult {
  const outcome = buildCalcResult(input);
  if (!outcome.ok) throw new Error(`expected ${input} to calculate, got ${outcome.code}`);
  return outcome.result;
}

const field = (result: CalcResult, key: string): string | undefined =>
  result.fields.find((entry) => entry.key === key)?.value;

describe('format helpers', () => {
  it('groups digits the British way', () => {
    expect(groupDigits(4294967296n)).toBe('4,294,967,296');
    expect(groupDigits(254n)).toBe('254');
    expect(groupDigits(0n)).toBe('0');
  });

  it('renders superscripts', () => {
    expect(superscript(64)).toBe('⁶⁴');
    expect(superscript(0)).toBe('⁰');
  });

  it('renders a scientific approximation', () => {
    expect(scientific(18446744073709551616n)).toBe('≈ 1.84 × 10¹⁹');
    expect(scientific(1000000000000000000n)).toBe('≈ 1.00 × 10¹⁸');
  });

  it('shows exact digits up to 2^53 and a power of two beyond it', () => {
    expect(formatCount(254n)).toEqual({ primary: '254', exact: '254' });
    expect(formatCount(2n ** 53n).approx).toBeUndefined();
    expect(formatCount(2n ** 64n)).toEqual({
      primary: '2⁶⁴',
      approx: '≈ 1.84 × 10¹⁹',
      exact: '18,446,744,073,709,551,616',
    });
  });

  it('falls back to scientific notation for a large non-power of two', () => {
    const display = formatCount(2n ** 64n - 2n);
    expect(display.primary).toBe('≈ 1.84 × 10¹⁹');
    expect(display.exact).toBe('18,446,744,073,709,551,614');
  });

  it('formats percentages to at most one decimal place', () => {
    expect(formatPercent(1n, 2n)).toBe('50');
    expect(formatPercent(1n, 3n)).toBe('33.3');
    expect(formatPercent(0n, 0n)).toBe('0');
    expect(formatPercent(4n, 4n)).toBe('100');
  });
});

describe('buildCalcResult — IPv4 (FR-CALC-02)', () => {
  const result = ok('192.168.1.37/24');

  it('derives the network without treating host bits as an error', () => {
    expect(result.family).toBe(4);
    expect(result.networkText).toBe('192.168.1.0');
    expect(field(result, 'mask')).toBe('255.255.255.0');
    expect(field(result, 'wildcard')).toBe('0.0.0.255');
    expect(field(result, 'broadcast')).toBe('192.168.1.255');
    expect(field(result, 'firstUsable')).toBe('192.168.1.1');
    expect(field(result, 'lastUsable')).toBe('192.168.1.254');
    expect(field(result, 'usable')).toBe('254');
    expect(field(result, 'total')).toBe('256');
  });

  it('notes that the input was a host address', () => {
    expect(result.notes.map((note) => note.id)).toContain('HOST_BITS_SET');
  });

  it('builds a 32-cell bit ruler with the boundary at the prefix', () => {
    expect(result.ruler.cells).toHaveLength(32);
    expect(result.ruler.boundaryAfter).toBe(24);
    expect(result.ruler.cells.filter((cell) => cell.network)).toHaveLength(24);
    expect(result.ruler.cells.map((cell) => cell.text).join('')).toBe(
      '11000000101010000000000100000000',
    );
  });

  it('reports the reserved range', () => {
    expect(result.specials.map((match) => match.range.label)).toEqual(['Private (RFC 1918)']);
  });
});

describe('buildCalcResult — IPv4 edge cases (spec §4.4)', () => {
  it('marks a /31 as an RFC 3021 point-to-point link', () => {
    const result = ok('198.51.100.6/31');
    expect(result.notes.map((note) => note.id)).toContain('rfc3021');
    expect(field(result, 'usable')).toBe('2');
    expect(result.usableRangeText).toBe('198.51.100.6 – 198.51.100.7');
  });

  it('marks a /32 as a host route', () => {
    const result = ok('203.0.113.9/32');
    expect(result.notes.map((note) => note.id)).toContain('host-route');
    expect(field(result, 'usable')).toBe('1');
  });

  it('handles /0', () => {
    const result = ok('0.0.0.0/0');
    expect(field(result, 'total')).toBe('4,294,967,296');
    expect(field(result, 'usable')).toBe('4,294,967,294');
  });

  it('accepts a dotted mask', () => {
    const result = ok('10.0.0.0 255.255.255.0');
    expect(result.prefix).toBe(24);
    expect(field(result, 'mask')).toBe('255.255.255.0');
  });
});

describe('buildCalcResult — IPv6 (FR-CALC-03)', () => {
  const result = ok('2001:db8::1/48');

  it('shows the canonical and full forms', () => {
    expect(result.family).toBe(6);
    expect(field(result, 'canonical')).toBe('2001:db8::/48');
    expect(field(result, 'expanded')).toBe('2001:0db8:0000:0000:0000:0000:0000:0000');
    expect(field(result, 'lastAddress')).toBe('2001:db8:0:ffff:ffff:ffff:ffff:ffff');
  });

  it('never calls the last address a broadcast', () => {
    expect(result.fields.map((entry) => entry.key)).not.toContain('broadcast');
    expect(result.notes.map((note) => note.id)).toContain('no-broadcast');
  });

  it('counts every address as usable and shows large totals as a power of two', () => {
    const sixtyFour = ok('2001:db8::/64');
    expect(field(sixtyFour, 'total')).toBe('2⁶⁴');
    expect(sixtyFour.total.approx).toBe('≈ 1.84 × 10¹⁹');
    expect(sixtyFour.usable.exact).toBe(sixtyFour.total.exact);
  });

  it('badges a /64 as the standard subnet size', () => {
    expect(ok('2001:db8::/64').notes.map((note) => note.id)).toContain('standard-subnet');
  });

  it('marks /127 and /128', () => {
    expect(ok('2001:db8::/127').notes.map((note) => note.id)).toContain('p2p-v6');
    expect(ok('2001:db8::1/128').notes.map((note) => note.id)).toContain('host-route');
  });

  it('builds an eight-cell group ruler with a partially filled boundary cell', () => {
    const partial = ok('2001:db8::/33');
    expect(partial.ruler.cells).toHaveLength(8);
    expect(partial.ruler.cells[2]?.networkBits).toBe(1);
    expect(partial.ruler.cells[2]?.network).toBe(false);
    expect(partial.ruler.cells[1]?.network).toBe(true);
  });
});

describe('the §5 acceptance inputs all calculate', () => {
  it.each([
    '192.168.1.37/24',
    '10.0.0.0 255.255.255.0',
    '2001:db8::1/48',
    '::ffff:10.0.0.1',
    'fe80::1%eth0',
  ])('%s', (input) => {
    const outcome = buildCalcResult(input);
    expect(outcome.ok).toBe(true);
  });

  it('reports a friendly message for an invalid input', () => {
    const outcome = buildCalcResult('999.1.1.1');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('BAD_OCTET');
      expect(outcome.message).toMatch(/0 to 255/);
    }
  });
});

describe('withPrefix (FR-CALC-06)', () => {
  it('recomputes in place', () => {
    const widened = withPrefix(ok('192.168.1.37/24'), 16);
    expect(widened.ok).toBe(true);
    if (widened.ok) {
      expect(widened.result.networkText).toBe('192.168.0.0');
      expect(widened.result.prefix).toBe(16);
    }
  });

  it('clamps to the family bounds', () => {
    const clamped = withPrefix(ok('10.0.0.0/8'), 99);
    expect(clamped.ok && clamped.result.prefix).toBe(32);
    const zero = withPrefix(ok('2001:db8::/48'), -5);
    expect(zero.ok && zero.result.prefix).toBe(0);
  });
});

describe('calcToMarkdown (FR-EXP-01)', () => {
  it('renders a table, the reserved ranges and the footer', () => {
    const markdown = calcToMarkdown(ok('10.1.2.3/8'));
    expect(markdown).toContain('### 10.1.2.3/8');
    expect(markdown).toContain('| Field | Value |');
    expect(markdown).toContain('| Network address | 10.0.0.0 |');
    expect(markdown).toContain('| Subnet mask | 255.0.0.0 |');
    expect(markdown).toContain('- `10.0.0.0/8` — Private (RFC 1918)');
    expect(markdown).toContain('_Generated by NetCarve — attv.uk_');
  });

  it('can leave the footer out', () => {
    expect(calcToMarkdown(ok('10.0.0.0/8'), false)).not.toContain('attv.uk');
  });

  it('marks a deprecated range', () => {
    expect(calcToMarkdown(ok('192.88.99.1/24'))).toContain('_(deprecated)_');
  });
});
