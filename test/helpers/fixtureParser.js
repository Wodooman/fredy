/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Fixture parser helper for offline provider tests.
 *
 * Loads a saved HTML fixture and runs the provider's parse → normalize → filter
 * pipeline without any network calls or Puppeteer dependency.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadParser, parse } from '../../lib/services/extractor/parser/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

/**
 * Resolve a fixture identifier to an absolute file path.
 *
 * @param {string} fixture  Either an absolute path or a provider ID
 *   (e.g. "sparkasse") which maps to `test/fixtures/sparkasse.html`.
 * @returns {string} Absolute path to the HTML file.
 */
function resolveFixturePath(fixture) {
  if (path.isAbsolute(fixture)) return fixture;
  return path.join(FIXTURES_DIR, `${fixture}.html`);
}

/**
 * Parse an HTML fixture through a provider's scraping pipeline.
 *
 * @param {object} options
 * @param {string} options.fixture          Provider ID or absolute path to HTML file.
 * @param {string} options.crawlContainer   CSS selector for listing containers.
 * @param {object} options.crawlFields      Field-name → selector map.
 * @param {function} [options.normalize]    Provider normalize function.
 * @param {function} [options.filter]       Provider filter function.
 * @returns {Promise<{ html: string, raw: object[]|null, normalized: object[]|null, filtered: object[]|null }>}
 */
export async function parseFixture({ fixture, crawlContainer, crawlFields, normalize, filter }) {
  const filePath = resolveFixturePath(fixture);
  const html = await readFile(filePath, 'utf-8');

  loadParser(html);
  const raw = parse(crawlContainer, crawlFields, html, `fixture://${fixture}`);

  if (raw == null) {
    return { html, raw: null, normalized: null, filtered: null };
  }

  const normalized = normalize ? raw.map(normalize) : raw;
  const filtered = filter ? normalized.filter(filter) : normalized;

  return { html, raw, normalized, filtered };
}
