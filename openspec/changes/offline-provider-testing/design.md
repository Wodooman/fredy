# Design: Offline Provider Testing

## Architecture

```
scripts/download-fixture.js          # CLI: downloads HTML fixtures
    ├── reads testProvider.json      # for provider URLs
    ├── uses puppeteerExtractor      # reuses existing Puppeteer logic
    └── writes test/fixtures/*.html  # output

test/helpers/fixtureParser.js        # Helper: parses fixtures with provider config
    ├── reads test/fixtures/*.html   # input
    └── uses parser.js (parse)       # reuses existing parser

test/provider-offline/*.test.js      # Tests: fast, deterministic
    └── uses fixtureParser.js        # no network, no Puppeteer
```

## Key Decisions

1. **Reuse `puppeteerExtractor`** for downloads — ensures the saved HTML matches what the real pipeline sees (JS-rendered, same wait logic).

2. **Parser is called directly** in the helper — no Extractor class needed since we already have the HTML. This avoids Puppeteer dependency in tests.

3. **Fixtures are committed to git** — they serve as snapshots of real site HTML. When a site changes, re-run the download script and update selectors + fixtures together.

4. **Fixtures are gitignored by default** — since they're large HTML files, they're added to `.gitignore`. Developers download them on-demand. A small sample fixture can be committed for CI.

## Trade-offs

| Decision | Pro | Con |
|----------|-----|-----|
| Fixtures in git (optional) | CI can run offline tests | Repo size grows |
| Separate test directory | Clear separation from live tests | Another directory to maintain |
| Reuse puppeteerExtractor | Consistent with real pipeline | Couples script to internal module |

## Download Script Flow

1. Parse CLI args (providerId, optional --url)
2. Load testProvider.json to get URL (unless --url provided)
3. Load provider module to get waitForSelector
4. Call puppeteerExtractor(url, waitForSelector, options)
5. Write HTML to test/fixtures/<providerId>.html
6. Exit

## Fixture Parser Helper API

```javascript
// test/helpers/fixtureParser.js
import { parseFixture } from './fixtureParser.js';

const result = await parseFixture({
  fixtureFile: 'sparkasse',           // or absolute path
  crawlContainer: provider.config.crawlContainer,
  crawlFields: provider.config.crawlFields,
  normalize: provider.config.normalize,
  filter: provider.config.filter,
});

// result = { raw: [...], normalized: [...], filtered: [...] }
```
