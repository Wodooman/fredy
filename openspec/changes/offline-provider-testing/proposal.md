# Proposal: Offline Provider Testing

## Problem

Provider tests currently fetch live pages via Puppeteer, making them:
- **Fragile** — tests break when external sites change HTML structure (e.g., sparkasse renaming `.estate-list-item-row` to `.estate-list-item`)
- **Slow** — each test takes 4-8 seconds due to real HTTP requests and browser rendering
- **Non-deterministic** — results vary based on network, geo-location, and site availability
- **Hard to debug** — when a selector breaks, there is no saved HTML to inspect

## Intent

Introduce an offline testing layer that runs provider scraping logic against saved HTML fixtures, enabling fast, deterministic validation of CSS selectors and normalize/filter functions.

## Approach

1. **Download script** (`scripts/download-fixture.js`) — uses Puppeteer to fetch a provider page and save the rendered HTML to `test/fixtures/<providerId>.html`.
2. **Test helper** (`test/helpers/fixtureParser.js`) — loads an HTML fixture file and runs the parser (`loadParser` + `parse`) plus the provider's `normalize` and `filter` functions, returning raw/normalized/filtered results.
3. **Fixture-based tests** (`test/provider-offline/*.test.js`) — lightweight tests that validate selectors against saved HTML without any network calls.

## Scope

- The download script and test helper are new additions.
- Existing live provider tests remain unchanged — offline tests complement them.
- One example offline test (sparkasse) to demonstrate the pattern.

## Out of Scope

- Fixing the sparkasse selectors (separate change).
- Replacing live tests entirely.
- Automating fixture refresh schedules.
