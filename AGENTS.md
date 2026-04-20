# AGENTS

This file helps AI coding agents work effectively in this repository.

## Scope and priorities

- This is a browser-focused TypeScript library.
- Keep public API behavior stable unless the task explicitly requires a breaking change.
- Prefer minimal, surgical changes.

## Setup and validation

- Use pnpm for all package operations.
- Install dependencies with: `pnpm install --frozen-lockfile`
- Run tests with: `pnpm test`
- Run lint with: `pnpm lint`
- Run formatting check with: `pnpm format:check`
- Run type checks with: `pnpm typecheck`
- Build with: `pnpm build`
- For full pre-release validation, match CI order from [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Code map

- Public exports are defined in [src/index.ts](src/index.ts).
- Public convenience APIs are in [src/core.ts](src/core.ts): `saveAs`, `saveText`, `saveJSON`, `saveCanvas`.
- Download implementation and browser fallbacks are in [src/FileDownloader.ts](src/FileDownloader.ts).
- Browser capability detection is in [src/BrowserDetector.ts](src/BrowserDetector.ts).
- Public option types are in [src/types.ts](src/types.ts).
- Main test coverage is in [tests/index.test.ts](tests/index.test.ts).

## Project conventions

- Keep indentation at 2 spaces and LF line endings (see [.editorconfig](.editorconfig)).
- Preserve ESM output expectations (`"type": "module"` in [package.json](package.json)).
- Do not manually edit generated build output in [dist/](dist/).
- Prefer existing tooling instead of introducing new format/lint/test frameworks.

## Testing guidance

- Test environment is jsdom (see [vitest.config.ts](vitest.config.ts)).
- When changing download flows, add or update tests that verify callback behavior (`onStart`, `onProgress`, `onComplete`, `onError`) and fallback paths.
- Keep API export expectations covered in [tests/index.test.ts](tests/index.test.ts).

## Implementation pitfalls

- `FileDownloader` handles multiple save paths: anchor download attribute, `msSaveOrOpenBlob`, and FileReader fallback. Changes should consider all paths.
- BOM insertion behavior is intentionally conditional on UTF-8-like MIME types and `autoBom`.
- Remote URL handling includes CORS probing and optional progress via XHR. Preserve error callback behavior.

## Additional project docs

- User-facing API usage and examples are in [README.md](README.md).
- Build config is in [tsdown.config.ts](tsdown.config.ts).
- TypeScript config extends shared strict settings from [tsconfig.json](tsconfig.json).
