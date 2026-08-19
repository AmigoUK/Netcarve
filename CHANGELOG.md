# Changelog

All notable changes to **NetCarve** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

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

[Unreleased]: https://github.com/AmigoUK/Netcarve/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.2
[0.0.1]: https://github.com/AmigoUK/Netcarve/releases/tag/v0.0.1
