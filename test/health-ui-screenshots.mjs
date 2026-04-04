/**
 * Health UI screenshot test script.
 * Navigates through the entire health feature flow, captures screenshots.
 *
 * Usage: node test/health-ui-screenshots.mjs
 */
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const BASE = 'http://localhost:5173';
const OUT = path.join(process.cwd(), 'test', 'screenshots', 'health');

if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

let step = 0;
async function screenshot(page, name) {
  step++;
  const file = path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  [${step}] ${name}`);
  return file;
}

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('404')) {
      console.log(`  [console.error] ${msg.text().slice(0, 120)}`);
    }
  });

  try {
    // 1. Login
    console.log('\n=== Login ===');
    await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1000));
    const inputs = await page.$$('input');
    if (inputs.length >= 2) {
      await inputs[0].type('admin');
      await inputs[1].type('admin');
    }
    await screenshot(page, 'login-form-filled');

    // Click submit button
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const login = btns.find((b) => b.textContent.toLowerCase().includes('login') || b.type === 'submit');
      if (login) login.click();
    });
    await new Promise((r) => setTimeout(r, 4000));
    console.log('  URL after login:', page.url());
    await screenshot(page, 'after-login');

    // 2. Health Overview Page
    console.log('\n=== Health Overview ===');
    await page.goto(`${BASE}/#/health`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 3000));
    console.log('  URL:', page.url());

    // Verify health page loaded
    const hasHealth = await page.evaluate(() => !!document.querySelector('.health-page, .health-grid'));
    console.log('  Health page rendered:', hasHealth);
    await screenshot(page, 'health-overview-full');

    // 3. KPI cards close-up (top 280px)
    console.log('\n=== KPI Cards ===');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(OUT, `${String(++step).padStart(2, '0')}-health-kpi-cards.png`),
      clip: { x: 0, y: 0, width: 1440, height: 280 },
    });
    console.log(`  [${step}] health-kpi-cards`);

    // 4. Filter — show only Failing
    console.log('\n=== Filter: Failing ===');
    await page.evaluate(() => {
      const radios = [...document.querySelectorAll('.semi-radio-addon')];
      const failing = radios.find((r) => r.textContent.trim() === 'Failing');
      if (failing) failing.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await screenshot(page, 'health-filter-failing');

    // 5. Filter — show only Degraded
    console.log('\n=== Filter: Degraded ===');
    await page.evaluate(() => {
      const radios = [...document.querySelectorAll('.semi-radio-addon')];
      const degraded = radios.find((r) => r.textContent.trim() === 'Degraded');
      if (degraded) degraded.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await screenshot(page, 'health-filter-degraded');

    // Reset to All
    await page.evaluate(() => {
      const radios = [...document.querySelectorAll('.semi-radio-addon')];
      const all = radios.find((r) => r.textContent.trim() === 'All');
      if (all) all.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // 6. Hover over a timeline dot for tooltip
    console.log('\n=== Timeline Dot Hover ===');
    const dotPos = await page.evaluate(() => {
      const dots = [...document.querySelectorAll('.run-timeline__dot--success, .run-timeline__dot--failure')];
      if (dots.length > 0) {
        const dot = dots[dots.length - 1];
        const rect = dot.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      return null;
    });
    if (dotPos) {
      await page.mouse.move(dotPos.x, dotPos.y);
      await new Promise((r) => setTimeout(r, 1500));
      await screenshot(page, 'timeline-dot-hover-tooltip');
    } else {
      console.log('  No dots found, skipping hover');
    }

    // 7. Click on failing job (red status) to go to detail
    console.log('\n=== Job Detail (Red/Failing) ===');
    await page.goto(`${BASE}/#/health`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    // Find and click a card — try to find one with failure count > 0
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.health-grid__card')];
      // Click first card
      if (cards[0]) cards[0].click();
    });
    await new Promise((r) => setTimeout(r, 3000));
    console.log('  URL:', page.url());
    await screenshot(page, 'job-detail-page');

    // 8. Scroll down to see run list
    console.log('\n=== Run List ===');
    await page.evaluate(() => window.scrollBy(0, 350));
    await new Promise((r) => setTimeout(r, 500));
    await screenshot(page, 'job-detail-runs-list');

    // 9. Expand a run card
    console.log('\n=== Expand Run Card ===');
    const expanded = await page.evaluate(() => {
      const headers = [...document.querySelectorAll('.semi-collapse-header')];
      if (headers[0]) {
        headers[0].click();
        return true;
      }
      return false;
    });
    if (expanded) {
      await new Promise((r) => setTimeout(r, 1500));
      await screenshot(page, 'run-card-expanded-with-providers');
    } else {
      console.log('  No collapse header found');
    }

    // 10. Click "View Log" to open execution log modal
    console.log('\n=== Execution Log Modal ===');
    const logClicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const viewLog = btns.find((b) => b.textContent.includes('View Log'));
      if (viewLog) {
        viewLog.click();
        return true;
      }
      return false;
    });
    if (logClicked) {
      await new Promise((r) => setTimeout(r, 3000));
      await screenshot(page, 'execution-log-modal');

      // Close modal
      await page.evaluate(() => {
        const close = document.querySelector('.semi-modal-close');
        if (close) close.click();
      });
      await new Promise((r) => setTimeout(r, 500));
    } else {
      console.log('  No "View Log" button found');
    }

    // 11. Navigate to yellow (degraded) job
    console.log('\n=== Job Detail (Yellow/Degraded) ===');
    await page.goto(`${BASE}/#/health`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    // Click second card (should be different status)
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.health-grid__card')];
      if (cards[1]) cards[1].click();
    });
    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, 'job-detail-yellow');

    // Expand a failed run in this job
    await page.evaluate(() => {
      const headers = [...document.querySelectorAll('.semi-collapse-header')];
      // Try to find one that has a red tag
      const failedHeader = headers.find((h) => h.querySelector('.semi-tag-red'));
      if (failedHeader) failedHeader.click();
      else if (headers[0]) headers[0].click();
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.evaluate(() => window.scrollBy(0, 200));
    await screenshot(page, 'yellow-job-expanded-run');

    // 12. Navigate to green (healthy) job
    console.log('\n=== Job Detail (Green/Healthy) ===');
    await page.goto(`${BASE}/#/health`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    // Click last card (green jobs sorted to end by default)
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.health-grid__card')];
      if (cards.length > 2) cards[cards.length - 1].click();
      else if (cards[0]) cards[0].click();
    });
    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, 'job-detail-green');

    // 13. Empty search state
    console.log('\n=== Empty State ===');
    await page.goto(`${BASE}/#/health`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));

    const searchInput = await page.$('.health-grid__filters input');
    if (searchInput) {
      await searchInput.type('nonexistent xyz 12345');
      await new Promise((r) => setTimeout(r, 1000));
      await screenshot(page, 'health-empty-search-state');
    }

    // 14. Back button from detail page
    console.log('\n=== Back Navigation ===');
    await page.goto(`${BASE}/#/health`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2000));
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.health-grid__card')];
      if (cards[0]) cards[0].click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Click back button
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const back = btns.find((b) => b.textContent.includes('Back to Health'));
      if (back) back.click();
    });
    await new Promise((r) => setTimeout(r, 2000));
    await screenshot(page, 'back-to-health-overview');

    console.log(`\n=== Done! ${step} screenshots saved to ${OUT} ===`);
  } catch (err) {
    console.error('Error:', err.message);
    await screenshot(page, 'error-state');
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
