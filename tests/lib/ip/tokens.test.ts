import { describe, expect, it } from 'vitest';
import { formatCidr } from '@/src/lib/ip/cidr';
import { findIpTokens } from '@/src/lib/ip/tokens';

const texts = (input: string): string[] => findIpTokens(input).map((token) => token.text);
const blocks = (input: string): string[] =>
  findIpTokens(input).map((token) => formatCidr(token.cidr));

describe('findIpTokens', () => {
  it('finds a bare IPv4 address', () => {
    expect(texts('10.0.0.1')).toEqual(['10.0.0.1']);
    expect(blocks('10.0.0.1')).toEqual(['10.0.0.1/32']);
  });

  it('finds a token wrapped in punctuation', () => {
    expect(texts('The block (10.0.0.0/8), formerly class A, is private.')).toEqual([
      '10.0.0.0/8',
    ]);
  });

  it('keeps a prefix that ends a sentence', () => {
    expect(texts('Use 192.168.10.0/24.')).toEqual(['192.168.10.0/24']);
    expect(texts('Use 2001:db8::/48.')).toEqual(['2001:db8::/48']);
  });

  it('finds an IPv4 address after a label with no space', () => {
    expect(texts('IP:10.0.0.1')).toEqual(['10.0.0.1']);
  });

  it('finds an address and dotted mask pair', () => {
    expect(blocks('network 10.0.0.0 255.255.255.0 broadcast')).toEqual(['10.0.0.0/24']);
  });

  it('falls back to the bare address when the pair is really two addresses', () => {
    expect(texts('servers 10.0.0.1 10.0.0.2')).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('reports nothing when both the block and the bare address are invalid', () => {
    expect(texts('bogus 999.1.1.1/24 here')).toEqual([]);
  });

  it('still reports the second half of a broken pair when it is a valid address', () => {
    expect(texts('bogus 999.1.1.1 255.255.255.0 here')).toEqual(['255.255.255.0']);
  });

  it('falls back to the bare address when the prefix is out of range', () => {
    expect(blocks('10.0.0.1/33')).toEqual(['10.0.0.1/32']);
  });

  it('finds several tokens in order of appearance', () => {
    expect(texts('peer 198.51.100.1, local 203.0.113.5/32, v6 2001:db8::1')).toEqual([
      '198.51.100.1',
      '203.0.113.5/32',
      '2001:db8::1',
    ]);
  });

  it('finds IPv6 in brackets with a port', () => {
    expect(texts('connect to [2001:db8::1]:443')).toEqual(['2001:db8::1']);
  });

  it('finds an IPv6 address with a zone ID', () => {
    expect(blocks('link-local fe80::1%eth0 on the wire')).toEqual(['fe80::1/128']);
  });

  it('finds an IPv4-mapped IPv6 address without also reporting its tail', () => {
    expect(texts('mapped ::ffff:192.0.2.1 here')).toEqual(['::ffff:192.0.2.1']);
  });

  it('finds a compressed IPv6 block', () => {
    expect(blocks('route ::/0 via ::1')).toEqual(['::/0', '::1/128']);
  });

  const nearMisses = [
    'nothing to see here',
    '',
    'octet out of range 999.1.1.1',
    'build 1.2.3.4000',
    'semver v1.2.3.4-beta',
    'shorthand 10.1',
    'MAC 00:1a:2b:3c:4d:5e',
    'at 10:30:45 today',
    'ratio 16:9',
    'section 1.2.3.4.5',
  ];

  it.each(nearMisses)('finds nothing in %s', (input) => {
    expect(texts(input)).toEqual([]);
  });

  it('reports the offset of each token', () => {
    const found = findIpTokens('see 10.0.0.0/8 now');
    expect(found).toHaveLength(1);
    expect(found[0]?.index).toBe(4);
  });

  it('handles a multi-line selection', () => {
    expect(texts('10.0.0.0/8\n# comment\n192.168.0.0/16\n')).toEqual([
      '10.0.0.0/8',
      '192.168.0.0/16',
    ]);
  });
});
