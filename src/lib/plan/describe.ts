/**
 * Human-readable summaries of a block, shared by the planner rows, the VLSM table and every
 * exporter so the three never drift apart.
 */

import { formatAddressValue, formatCidr, type Cidr } from '../ip/cidr';
import { lastAddressOf, networkAddressOf, totalAddresses, usableRange } from '../ip/math';
import { formatCount, type CountDisplay } from '../format';
import { formatIPv4, maskV4 } from '../ip/v4';

export interface BlockSummary {
  readonly cidr: string;
  /** Dotted mask — IPv4 only; IPv6 rows leave this blank (FR-EXP-01). */
  readonly mask: string;
  readonly firstAddress: string;
  readonly lastAddress: string;
  /** `first – last`. */
  readonly range: string;
  readonly usable: CountDisplay;
  readonly total: CountDisplay;
  /** Raw counts, for exports that want plain digits rather than grouped display text. */
  readonly usableCount: bigint;
  readonly totalCount: bigint;
  /** True for an IPv6 /64 — the standard subnet size (FR-PLAN-10). */
  readonly standardSubnet: boolean;
}

export function describeBlock(block: Cidr): BlockSummary {
  const first = networkAddressOf(block);
  const last = lastAddressOf(block);
  const show = (value: number | bigint) => formatAddressValue(block.family, value);
  const firstAddress = show(first);
  const lastAddress = show(last);

  const usableCount = usableRange(block).count;
  const totalCount = totalAddresses(block);

  return {
    cidr: formatCidr(block),
    mask: block.family === 4 ? formatIPv4(maskV4(block.prefix)) : '',
    firstAddress,
    lastAddress,
    range: `${firstAddress} – ${lastAddress}`,
    usable: formatCount(usableCount),
    total: formatCount(totalCount),
    usableCount,
    totalCount,
    standardSubnet: block.family === 6 && block.prefix === 64,
  };
}
