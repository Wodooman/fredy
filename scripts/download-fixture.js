/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Download a provider page as an HTML fixture for offline testing.
 *
 * Usage:
 *   node scripts/download-fixture.js <providerId> [--url <customUrl>]
 *
 * Examples:
 *   node scripts/download-fixture.js sparkasse
 *   node scripts/download-fixture.js sparkasse --url "https://example.com/search"
 *   node scripts/download-fixture.js --all
 */

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import puppeteerExtractor, { closeBrowser, launchBrowser } from '../lib/services/extractor/puppeteerExtractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../test/fixtures');
const PROVIDER_CONFIG_PATH = path.resolve(__dirname, '../test/provider/testProvider.json');
const PROVIDERS_DIR = path.resolve(__dirname, '../lib/provider');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { providerIds: [], url: null, all: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      result.url = args[++i];
    } else if (args[i] === '--all') {
      result.all = true;
    } else if (!args[i].startsWith('-')) {
      result.providerIds.push(args[i]);
    }
  }

  return result;
}

async function loadProviderConfig() {
  const raw = await readFile(PROVIDER_CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function getWaitForSelector(providerId) {
  try {
    const mod = await import(path.join(PROVIDERS_DIR, `${providerId}.js`));
    return mod.config?.waitForSelector ?? null;
  } catch {
    return null;
  }
}

async function downloadFixture(providerId, url, waitForSelector, browser) {
  const outPath = path.join(FIXTURES_DIR, `${providerId}.html`);

  console.warn(`Downloading fixture for "${providerId}" from ${url} ...`);

  const html = await puppeteerExtractor(url, waitForSelector, {
    browser,
    puppeteerHeadless: true,
    puppeteerTimeout: 60_000,
  });

  if (html == null) {
    console.error(`  ERROR: Puppeteer returned no content for "${providerId}".`);
    return false;
  }

  await writeFile(outPath, html, 'utf-8');
  console.warn(`  Saved ${outPath} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
  return true;
}

async function main() {
  const { providerIds, url, all } = parseArgs(process.argv);
  const providerConfig = await loadProviderConfig();

  let targets;

  if (all) {
    targets = Object.keys(providerConfig);
  } else if (providerIds.length > 0) {
    targets = providerIds;
  } else {
    console.error('Usage: node scripts/download-fixture.js <providerId> [--url <url>]');
    console.error('       node scripts/download-fixture.js --all');
    console.error(`\nAvailable providers: ${Object.keys(providerConfig).join(', ')}`);
    process.exit(1);
  }

  let failed = 0;

  // Resolve the first valid URL so we can launch the shared browser.
  const firstUrl = url ?? providerConfig[targets[0]]?.url ?? 'https://example.com';
  const browser = await launchBrowser(firstUrl, { puppeteerHeadless: true, puppeteerTimeout: 60_000 });

  try {
    for (const id of targets) {
      const targetUrl = url ?? providerConfig[id]?.url;
      if (!targetUrl) {
        console.error(`ERROR: Provider "${id}" not found in testProvider.json and no --url provided.`);
        failed++;
        continue;
      }

      const waitForSelector = await getWaitForSelector(id);
      const ok = await downloadFixture(id, targetUrl, waitForSelector, browser);
      if (!ok) failed++;
    }
  } finally {
    await closeBrowser(browser);
  }

  if (failed > 0) {
    console.error(`\n${failed} fixture(s) failed to download.`);
    process.exit(1);
  }

  console.warn('\nDone.');
}

main();
