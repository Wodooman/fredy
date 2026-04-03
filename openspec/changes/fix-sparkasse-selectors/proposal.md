# Proposal: Fix Sparkasse Provider Selectors

## Problem

The sparkasse provider's `crawlContainer` uses `.estate-list-item-row`, but the site now uses `.estate-list-item`. This causes the parser to find zero elements, returning `null`, which propagates as `undefined` from `execute()`.

## Intent

Update the single broken CSS selector so sparkasse scraping works again.

## Approach

Change `crawlContainer` from `.estate-list-item-row` to `.estate-list-item` in `lib/provider/sparkasse.js`. All other selectors (`crawlFields`, `normalize`, `filter`) work correctly with the new container.

## Scope

- One-line fix in `lib/provider/sparkasse.js`.
- Offline test validates the fix against the saved fixture.
