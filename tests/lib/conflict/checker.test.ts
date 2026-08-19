import { describe, expect, it } from 'vitest';
import { checkConflicts, parseConflictInput } from '@/src/lib/conflict/checker';
import { formatCidr, type Cidr } from '@/src/lib/ip/cidr';
import { relationOf } from '@/src/lib/ip/math';

const chains = (text: string) =>
  checkConflicts(text).containment.map((chain) => chain.blocks.map((block) => block.cidr));

describe('parseConflictInput (FR-CONF-01)', () => {
  it('reads one entry per line, ignoring blanks and comments', () => {
    const { entries, errors } = parseConflictInput(
      ['# client A', '10.0.0.0/8', '', '  192.168.0.0/16  # branch office', '2001:db8::/48'].join(
        '\n',
      ),
    );
    expect(entries.map((entry) => entry.cidr)).toEqual([
      '10.0.0.0/8',
      '192.168.0.0/16',
      '2001:db8::/48',
    ]);
    expect(errors).toEqual([]);
  });

  it('accepts a bare address and a dotted mask', () => {
    const { entries } = parseConflictInput('10.0.0.1\n10.1.0.0 255.255.0.0');
    expect(entries.map((entry) => entry.cidr)).toEqual(['10.0.0.1/32', '10.1.0.0/16']);
  });

  it('rebases an entry onto its network address', () => {
    const { entries } = parseConflictInput('10.1.2.3/8');
    expect(entries[0]?.cidr).toBe('10.0.0.0/8');
  });

  it('reports an unreadable line with its number without aborting the run', () => {
    const { entries, errors } = parseConflictInput('10.0.0.0/8\n999.1.1.1\n172.16.0.0/12');
    expect(entries).toHaveLength(2);
    expect(errors).toEqual([
      { line: 2, text: '999.1.1.1', message: expect.stringMatching(/0 to 255/) as unknown as string },
    ]);
  });
});

describe('checkConflicts', () => {
  it('reports a clean list (FR-CONF-04)', () => {
    const report = checkConflicts('10.0.0.0/8\n172.16.0.0/12\n192.168.0.0/16');
    expect(report.clean).toBe(true);
    expect(report.blockCount).toBe(3);
    expect(report.identical).toEqual([]);
    expect(report.containment).toEqual([]);
  });

  it('groups identical entries with their line numbers', () => {
    const report = checkConflicts('10.0.0.0/8\n172.16.0.0/12\n10.0.0.0/8\n10.1.2.3/8');
    expect(report.identical).toEqual([{ cidr: '10.0.0.0/8', lines: [1, 3, 4] }]);
    expect(report.clean).toBe(false);
  });

  it('builds a containment chain outermost first (FR-CONF-03)', () => {
    expect(chains('10.1.2.0/24\n10.0.0.0/8\n10.1.0.0/16')).toEqual([
      ['10.0.0.0/8', '10.1.0.0/16', '10.1.2.0/24'],
    ]);
  });

  it('reports one chain per innermost block', () => {
    expect(chains('10.0.0.0/8\n10.1.0.0/16\n10.2.0.0/16')).toEqual([
      ['10.0.0.0/8', '10.1.0.0/16'],
      ['10.0.0.0/8', '10.2.0.0/16'],
    ]);
  });

  it('never lets the families conflict (FR-CONF-02)', () => {
    const report = checkConflicts('0.0.0.0/0\n::/0\n2001:db8::/32');
    expect(report.identical).toEqual([]);
    expect(chains('0.0.0.0/0\n::/0\n2001:db8::/32')).toEqual([['::/0', '2001:db8::/32']]);
    expect(report.blockCount).toBe(3);
  });

  it('handles IPv6 containment', () => {
    expect(chains('2001:db8::/32\n2001:db8:1::/48')).toEqual([
      ['2001:db8::/32', '2001:db8:1::/48'],
    ]);
  });

  it('counts distinct blocks, not lines', () => {
    expect(checkConflicts('10.0.0.0/8\n10.0.0.0/8').blockCount).toBe(1);
  });

  it('copes with nothing to check', () => {
    const report = checkConflicts('');
    expect(report.clean).toBe(true);
    expect(report.blockCount).toBe(0);
  });
});

/** A deliberately naive reference implementation, used to check the sweep. */
function bruteForceConflicts(blocks: Cidr[]): Set<string> {
  const conflicting = new Set<string>();
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const relation = relationOf(blocks[i] as Cidr, blocks[j] as Cidr);
      if (relation !== 'disjoint') {
        conflicting.add(formatCidr(blocks[i] as Cidr));
        conflicting.add(formatCidr(blocks[j] as Cidr));
      }
    }
  }
  return conflicting;
}

/** A tiny deterministic PRNG, so a failing case can always be reproduced. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomBlock(random: () => number): string {
  const prefix = 8 + Math.floor(random() * 17); // /8 … /24
  const first = 10 + Math.floor(random() * 4);
  const second = Math.floor(random() * 256);
  const third = Math.floor(random() * 256);
  return `${first}.${second}.${third}.0/${prefix}`;
}

describe('the sweep agrees with a brute-force oracle', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i', (seed) => {
    const random = seededRandom(seed);
    const lines = Array.from({ length: 60 }, () => randomBlock(random));
    const report = checkConflicts(lines.join('\n'));

    const blocks = report.entries.map((entry) => entry.block);
    const expected = bruteForceConflicts(blocks);

    const reported = new Set<string>();
    for (const group of report.identical) reported.add(group.cidr);
    for (const chain of report.containment) {
      for (const block of chain.blocks) reported.add(block.cidr);
    }

    expect([...reported].sort()).toEqual([...expected].sort());
    expect(report.clean).toBe(expected.size === 0);
  });
});

describe('performance (FR-CONF-05)', () => {
  it('checks 1,000 lines in well under a second', () => {
    const lines: string[] = [];
    for (let index = 0; index < 1000; index += 1) {
      lines.push(`10.${index % 256}.${Math.floor(index / 256)}.0/24`);
    }
    const started = performance.now();
    const report = checkConflicts(lines.join('\n'));
    const elapsed = performance.now() - started;

    expect(report.entries).toHaveLength(1000);
    expect(elapsed).toBeLessThan(1000);
  });

  it('stays fast when every line contains the next', () => {
    const lines = Array.from({ length: 1000 }, (_value, index) => `10.0.0.0/${8 + (index % 20)}`);
    const started = performance.now();
    checkConflicts(lines.join('\n'));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
