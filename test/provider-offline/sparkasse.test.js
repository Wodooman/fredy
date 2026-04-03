/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Offline test for sparkasse provider selectors.
 *
 * Runs the parser against a saved HTML fixture — no network calls, no Puppeteer.
 * To refresh the fixture:  node scripts/download-fixture.js sparkasse
 */

import { expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFixture } from '../helpers/fixtureParser.js';
import * as provider from '../../lib/provider/sparkasse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../fixtures/sparkasse.html');
const fixtureExists = existsSync(fixturePath);

describe.skipIf(!fixtureExists)('#sparkasse offline testsuite', () => {
  beforeAll(() => {
    provider.init({ enabled: true, url: 'https://immobilien.sparkasse.de/test' }, []);
  });

  it('should find listing containers in the HTML', async () => {
    const { raw } = await parseFixture({
      fixture: 'sparkasse',
      crawlContainer: provider.config.crawlContainer,
      crawlFields: provider.config.crawlFields,
    });

    expect(raw, `No elements matched crawlContainer "${provider.config.crawlContainer}"`).toBeInstanceOf(Array);
    expect(raw.length).toBeGreaterThan(0);
  });

  it('should extract required fields from each listing', async () => {
    const { raw } = await parseFixture({
      fixture: 'sparkasse',
      crawlContainer: provider.config.crawlContainer,
      crawlFields: provider.config.crawlFields,
    });

    expect(raw).toBeInstanceOf(Array);
    for (const item of raw) {
      expect(item.id, 'id field must be non-null').not.toBeNull();
      expect(item.title, 'title field must be non-null').not.toBeNull();
      expect(item.price, 'price field must be non-null').not.toBeNull();
      expect(item.link, 'link field must be non-null').not.toBeNull();
    }
  });

  it('should normalize listings correctly', async () => {
    const { normalized } = await parseFixture({
      fixture: 'sparkasse',
      crawlContainer: provider.config.crawlContainer,
      crawlFields: provider.config.crawlFields,
      normalize: provider.config.normalize,
    });

    expect(normalized).toBeInstanceOf(Array);
    for (const item of normalized) {
      expect(item.id).toBeTypeOf('string');
      expect(item.id).not.toBe('');
      expect(item.title).toBeTypeOf('string');
      expect(item.link).toContain('https://');
    }
  });

  it('should filter listings without errors', async () => {
    const { filtered, normalized } = await parseFixture({
      fixture: 'sparkasse',
      crawlContainer: provider.config.crawlContainer,
      crawlFields: provider.config.crawlFields,
      normalize: provider.config.normalize,
      filter: provider.config.filter,
    });

    expect(filtered).toBeInstanceOf(Array);
    expect(filtered.length).toBeLessThanOrEqual(normalized.length);
    expect(filtered.length).toBeGreaterThan(0);
  });
});
