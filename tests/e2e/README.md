# E2E Tests

This directory contains end-to-end tests for the tinysaver library using Vitest browser mode with Playwright.

## Overview

The e2e tests run in real browsers (Chromium, Firefox, WebKit) to ensure the library works correctly across different browser environments.

## Setup

### Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- Playwright browsers installed

### Installation

```bash
# Install dependencies
pnpm install

# Install Playwright browsers
npx playwright install chromium firefox webkit

# Install system dependencies for Playwright (Linux only)
npx playwright install-deps
```

## Running Tests

```bash
# Run e2e tests (browsers configured in vitest.config.e2e.ts)
pnpm test:e2e

# To run tests in a specific browser, update vitest.config.e2e.ts (e.g. select only chromium)
# and rerun the command above.
```

## Test Configuration

The e2e tests are configured in `vitest.config.e2e.ts` and include:

- **Browser Mode**: Uses Vitest browser mode with Playwright provider
- **Multi-Browser Testing**: Tests run on Chromium, Firefox, and WebKit
- **Headless Mode**: Browsers run in headless mode for CI/CD compatibility

## Test Coverage

The e2e tests cover:

1. **Browser Detection** - Verifies browser capability detection works in real browsers
2. **saveAs Functionality** - Tests file download with Blob objects
3. **saveText** - Tests text file saving with various content types
4. **saveJSON** - Tests JSON serialization and saving
5. **saveCanvas** - Tests canvas to image conversion and saving
6. **Error Handling** - Tests graceful error handling
7. **Cross-Browser Compatibility** - Ensures consistent behavior across browsers
8. **Lifecycle Callbacks** - Tests onStart, onComplete, and onError callbacks

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: pnpm
      - run: pnpm install
      - run: npx playwright install --with-deps
      - run: pnpm test:e2e
```

## Notes

- E2E tests require a display server or run in headless mode
- System dependencies may vary by platform (see Playwright documentation)
- Tests use `disableClick: true` to prevent actual file downloads during testing
- Multi-browser testing ensures cross-browser compatibility

## Troubleshooting

### Missing System Dependencies

If you encounter missing library errors:

```bash
# Linux (Debian/Ubuntu)
npx playwright install-deps

# macOS
# Usually no additional dependencies needed

# Windows
# Usually no additional dependencies needed
```

### Timeout Issues

If tests timeout, increase the timeout in `vitest.config.e2e.ts`:

```typescript
export default defineConfig({
  test: {
    testTimeout: 60000, // Increase from 30000
  },
})
```

### Browser Not Found

Ensure browsers are installed:

```bash
npx playwright install chromium firefox webkit
```
