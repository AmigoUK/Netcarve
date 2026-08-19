# Changelog

All notable changes to **NetCarve** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.0.4] — 2026-08-19

### Added
- `src/lib/ip/cidr.ts`: the `Cidr` value type (a discriminated union on `family`, so IPv4
  narrows to `number` and IPv6 to `bigint`), plus `parseCidr`, `formatCidr`,
  `formatAddress`, `makeCidr` and `bitsOf`.
- `parseCidr` accepts `addr`, `addr/prefix`, and — for IPv4 — both `addr mask` and
  `addr/mask` with a contiguous dotted mask. A bare address becomes `/32` or `/128` with an
  `ASSUMED_HOST_PREFIX` warning, and an address carrying bits below the prefix boundary is
  accepted with a `HOST_BITS_SET` warning (spec §4.4: never an error).

### Tests
- 33 vectors: both families, both mask spellings, warning propagation from the IPv6 zone-ID
  parser, the /0 and /32 extremes, and every rejection code (`BAD_PREFIX`, `BAD_FORM`,
  `MASK_NOT_SUPPORTED`, `NONCONTIGUOUS_MASK` and the underlying address errors).

## [0.0.3] — 2026-08-19

### Added
- `src/lib/ip/v6.ts`: `parseIPv6`, `formatIPv6`, `expandIPv6`, `maskV6` and `MAX128`.
- RFC 4291 parsing — a single `::` compression, an embedded IPv4 tail (`::ffff:192.0.2.1`),
  case-insensitive input, and a zone ID (`%eth0`) that is stripped and reported as a
  warning rather than an error.
- RFC 5952 §4 canonical formatting — lowercase hex, no leading zeros inside a group, and the
  longest run of two or more zero groups compressed to `::`, leftmost run winning a tie.
  A lone zero group is never compressed.

### Tests
- 60 vectors including `2001:db8:0:0:1::1` → `2001:db8::1:0:0:1`, the tie-break and
  single-zero-group rules, and every rejection path (`DOUBLE_COMPRESSION`, `BAD_GROUP`,
  `TOO_MANY_GROUPS`, `TOO_FEW_GROUPS`, misplaced IPv4 tail, empty zone ID).

## [0.0.2] — 2026-08-19

### Added
- `src/lib/ip/errors.ts`: `ParseResult` discriminated union, `ParseError` codes, `Warning`
  codes and the `isParseError` guard — nothing in the IP library throws.
- `src/lib/ip/v4.ts`: `parseIPv4`, `formatIPv4`, `maskV4`, `wildcardV4`, `parseV4Mask`,
  with strict rejection of leading zeros, shorthand and whitespace padding.

## [0.0.1] — 2026-08-19

### Added
- Initial project scaffold: WXT (Manifest V3) + Preact + TypeScript in strict mode.
- Vitest with jsdom and a 100 % branch-coverage threshold scoped to `src/lib/ip/**` (NFR-QUAL-01).
- Manifest requesting exactly `storage` and `contextMenus` (NFR-PERM-01).
- Extension icons at 16/32/48/96/128 px.
- The product specification (`docs/spec.md`), implementation plan and `DECISIONS.md`.

[Unreleased]: https://github.com/AmigoUK/Netcarve/compare/v0.0.4...HEAD
[0.0.4]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.4
[0.0.3]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.3
[0.0.2]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.2
[0.0.1]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.1
