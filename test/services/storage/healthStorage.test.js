/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// In-memory database for real SQL testing
let db;
let idCounter;

vi.mock('nanoid', () => ({
  nanoid: () => `id-${++idCounter}`,
}));

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => {
  return {
    default: {
      getConnection: () => db,
      query: (sql, params = {}) => db.prepare(sql).all(params),
      execute: (sql, params = {}) => db.prepare(sql).run(params),
      withTransaction: (callback) => {
        const trx = db.transaction((cb) => cb(db));
        return trx(callback);
      },
    },
  };
});

vi.mock('../../../lib/services/logger.js', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

function setupSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      user_id TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_runs (
      id                    TEXT    PRIMARY KEY,
      job_id                TEXT    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status                TEXT    NOT NULL CHECK(status IN ('success', 'failure')),
      started_at            INTEGER NOT NULL,
      finished_at           INTEGER NOT NULL,
      provider_count        INTEGER NOT NULL,
      failed_provider_count INTEGER NOT NULL,
      total_listings_found  INTEGER NOT NULL DEFAULT 0,
      total_new_listings    INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_runs_job_id ON job_runs(job_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_runs_started_at ON job_runs(started_at)`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_run_providers (
      id              TEXT    PRIMARY KEY,
      run_id          TEXT    NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
      provider_id     TEXT    NOT NULL,
      status          TEXT    NOT NULL CHECK(status IN ('success', 'failure')),
      error_message   TEXT,
      listings_found  INTEGER NOT NULL DEFAULT 0,
      new_listings    INTEGER NOT NULL DEFAULT 0,
      execution_log   TEXT    NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_run_providers_run_id ON job_run_providers(run_id)`);
}

function insertJob(id, name = 'Test Job', enabled = 1) {
  db.prepare(`INSERT INTO jobs (id, name, enabled, user_id) VALUES (?, ?, ?, 'user1')`).run(id, name, enabled);
}

function makeRun(jobId, status, startedAt, providers = []) {
  return {
    jobId,
    status,
    startedAt,
    finishedAt: startedAt + 5000,
    providers:
      providers.length > 0
        ? providers
        : [
            {
              providerId: 'immoscout',
              status,
              errorMessage: status === 'failure' ? 'Timeout' : null,
              listingsFound: 50,
              newListings: 3,
              executionLog: [
                { stage: 'extraction', status: 'success', duration_ms: 100, message: 'OK', details: null },
              ],
            },
          ],
  };
}

describe('services/storage/healthStorage', () => {
  let healthStorage;

  beforeEach(async () => {
    idCounter = 0;
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    setupSchema();

    vi.resetModules();
    healthStorage = await import('../../../lib/services/storage/healthStorage.js');
  });

  describe('recordJobRun', () => {
    it('inserts a run and provider records', () => {
      insertJob('j1');
      const runId = healthStorage.recordJobRun(makeRun('j1', 'success', 1000));

      expect(runId).toBeTruthy();

      const runs = db.prepare('SELECT * FROM job_runs WHERE job_id = ?').all('j1');
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('success');
      expect(runs[0].total_listings_found).toBe(50);
      expect(runs[0].total_new_listings).toBe(3);

      const providers = db.prepare('SELECT * FROM job_run_providers WHERE run_id = ?').all(runs[0].id);
      expect(providers).toHaveLength(1);
      expect(providers[0].provider_id).toBe('immoscout');
      expect(providers[0].listings_found).toBe(50);
    });

    it('aggregates listing counts across multiple providers', () => {
      insertJob('j1');
      healthStorage.recordJobRun(
        makeRun('j1', 'success', 1000, [
          {
            providerId: 'immoscout',
            status: 'success',
            errorMessage: null,
            listingsFound: 50,
            newListings: 3,
            executionLog: [],
          },
          {
            providerId: 'immowelt',
            status: 'success',
            errorMessage: null,
            listingsFound: 30,
            newListings: 1,
            executionLog: [],
          },
        ]),
      );

      const run = db.prepare('SELECT * FROM job_runs WHERE job_id = ?').get('j1');
      expect(run.total_listings_found).toBe(80);
      expect(run.total_new_listings).toBe(4);
      expect(run.provider_count).toBe(2);
      expect(run.failed_provider_count).toBe(0);
    });

    it('counts failed providers correctly', () => {
      insertJob('j1');
      healthStorage.recordJobRun(
        makeRun('j1', 'failure', 1000, [
          {
            providerId: 'immoscout',
            status: 'success',
            errorMessage: null,
            listingsFound: 50,
            newListings: 3,
            executionLog: [],
          },
          {
            providerId: 'immowelt',
            status: 'failure',
            errorMessage: 'Timeout',
            listingsFound: 0,
            newListings: 0,
            executionLog: [],
          },
        ]),
      );

      const run = db.prepare('SELECT * FROM job_runs WHERE job_id = ?').get('j1');
      expect(run.failed_provider_count).toBe(1);
    });

    it('enforces 20-run window — 21st run deletes oldest', () => {
      insertJob('j1');

      // Insert 20 runs
      for (let i = 1; i <= 20; i++) {
        healthStorage.recordJobRun(makeRun('j1', 'success', i * 1000));
      }

      let runs = db.prepare('SELECT * FROM job_runs WHERE job_id = ?').all('j1');
      expect(runs).toHaveLength(20);

      // The oldest run should have started_at = 1000
      const oldestBefore = db.prepare('SELECT MIN(started_at) AS min FROM job_runs WHERE job_id = ?').get('j1');
      expect(oldestBefore.min).toBe(1000);

      // Insert 21st run
      healthStorage.recordJobRun(makeRun('j1', 'success', 21000));

      runs = db.prepare('SELECT * FROM job_runs WHERE job_id = ?').all('j1');
      expect(runs).toHaveLength(20);

      // The oldest should now be 2000 (the original 1000 was deleted)
      const oldestAfter = db.prepare('SELECT MIN(started_at) AS min FROM job_runs WHERE job_id = ?').get('j1');
      expect(oldestAfter.min).toBe(2000);
    });

    it('cascade deletes provider records when oldest run is purged', () => {
      insertJob('j1');

      for (let i = 1; i <= 20; i++) {
        healthStorage.recordJobRun(makeRun('j1', 'success', i * 1000));
      }

      const totalProvidersBefore = db.prepare('SELECT COUNT(*) AS cnt FROM job_run_providers').get().cnt;
      expect(totalProvidersBefore).toBe(20);

      // Insert 21st — should delete oldest run + its providers
      healthStorage.recordJobRun(makeRun('j1', 'success', 21000));

      const totalProvidersAfter = db.prepare('SELECT COUNT(*) AS cnt FROM job_run_providers').get().cnt;
      expect(totalProvidersAfter).toBe(20);
    });

    it('window is per-job — other jobs unaffected', () => {
      insertJob('j1');
      insertJob('j2');

      for (let i = 1; i <= 20; i++) {
        healthStorage.recordJobRun(makeRun('j1', 'success', i * 1000));
      }
      healthStorage.recordJobRun(makeRun('j2', 'success', 1000));

      // Adding 21st to j1 should not affect j2
      healthStorage.recordJobRun(makeRun('j1', 'success', 21000));

      const j1Runs = db.prepare('SELECT COUNT(*) AS cnt FROM job_runs WHERE job_id = ?').get('j1').cnt;
      const j2Runs = db.prepare('SELECT COUNT(*) AS cnt FROM job_runs WHERE job_id = ?').get('j2').cnt;
      expect(j1Runs).toBe(20);
      expect(j2Runs).toBe(1);
    });
  });

  describe('getHealthOverview', () => {
    it('returns unknown status for jobs with no runs', () => {
      insertJob('j1', 'My Job');

      const overview = healthStorage.getHealthOverview();
      expect(overview).toHaveLength(1);
      expect(overview[0].jobId).toBe('j1');
      expect(overview[0].jobName).toBe('My Job');
      expect(overview[0].healthStatus).toBe('unknown');
      expect(overview[0].totalRuns).toBe(0);
      expect(overview[0].runs).toHaveLength(0);
      expect(overview[0].lastRunAt).toBeNull();
    });

    it('returns green when all runs succeed', () => {
      insertJob('j1');
      for (let i = 1; i <= 5; i++) {
        healthStorage.recordJobRun(makeRun('j1', 'success', i * 1000));
      }

      const overview = healthStorage.getHealthOverview();
      expect(overview[0].healthStatus).toBe('green');
      expect(overview[0].recentFailures).toBe(0);
      expect(overview[0].totalRuns).toBe(5);
    });

    it('returns red when latest run failed', () => {
      insertJob('j1');
      healthStorage.recordJobRun(makeRun('j1', 'success', 1000));
      healthStorage.recordJobRun(makeRun('j1', 'failure', 2000));

      const overview = healthStorage.getHealthOverview();
      expect(overview[0].healthStatus).toBe('red');
      expect(overview[0].recentFailures).toBe(1);
    });

    it('returns yellow when past failure but latest is success', () => {
      insertJob('j1');
      healthStorage.recordJobRun(makeRun('j1', 'failure', 1000));
      healthStorage.recordJobRun(makeRun('j1', 'success', 2000));

      const overview = healthStorage.getHealthOverview();
      expect(overview[0].healthStatus).toBe('yellow');
      expect(overview[0].recentFailures).toBe(1);
    });

    it('includes listing counts in run data', () => {
      insertJob('j1');
      healthStorage.recordJobRun(makeRun('j1', 'success', 1000));

      const overview = healthStorage.getHealthOverview();
      const run = overview[0].runs[0];
      expect(run.totalListingsFound).toBe(50);
      expect(run.totalNewListings).toBe(3);
    });

    it('returns runs ordered by started_at descending', () => {
      insertJob('j1');
      healthStorage.recordJobRun(makeRun('j1', 'success', 1000));
      healthStorage.recordJobRun(makeRun('j1', 'success', 3000));
      healthStorage.recordJobRun(makeRun('j1', 'success', 2000));

      const overview = healthStorage.getHealthOverview();
      const startedAts = overview[0].runs.map((r) => r.startedAt);
      expect(startedAts).toEqual([3000, 2000, 1000]);
    });

    it('includes disabled jobs with their health status', () => {
      insertJob('j1', 'Disabled Job', 0);
      healthStorage.recordJobRun(makeRun('j1', 'failure', 1000));

      const overview = healthStorage.getHealthOverview();
      expect(overview[0].enabled).toBe(false);
      expect(overview[0].healthStatus).toBe('red');
    });
  });

  describe('getJobHealth', () => {
    it('returns null for non-existent job', () => {
      const result = healthStorage.getJobHealth('nonexistent');
      expect(result).toBeNull();
    });

    it('returns job detail with per-provider summaries', () => {
      insertJob('j1', 'My Job');
      healthStorage.recordJobRun(
        makeRun('j1', 'failure', 1000, [
          {
            providerId: 'immoscout',
            status: 'success',
            errorMessage: null,
            listingsFound: 50,
            newListings: 3,
            executionLog: [],
          },
          {
            providerId: 'immowelt',
            status: 'failure',
            errorMessage: 'Timeout',
            listingsFound: 0,
            newListings: 0,
            executionLog: [],
          },
        ]),
      );

      const detail = healthStorage.getJobHealth('j1');
      expect(detail.jobId).toBe('j1');
      expect(detail.jobName).toBe('My Job');
      expect(detail.healthStatus).toBe('red');
      expect(detail.runs).toHaveLength(1);
      expect(detail.runs[0].providers).toHaveLength(2);

      const immoscout = detail.runs[0].providers.find((p) => p.providerId === 'immoscout');
      expect(immoscout.status).toBe('success');
      expect(immoscout.listingsFound).toBe(50);

      const immowelt = detail.runs[0].providers.find((p) => p.providerId === 'immowelt');
      expect(immowelt.status).toBe('failure');
      expect(immowelt.errorMessage).toBe('Timeout');
    });

    it('includes listing totals per run', () => {
      insertJob('j1');
      healthStorage.recordJobRun(
        makeRun('j1', 'success', 1000, [
          {
            providerId: 'immoscout',
            status: 'success',
            errorMessage: null,
            listingsFound: 50,
            newListings: 3,
            executionLog: [],
          },
          {
            providerId: 'immowelt',
            status: 'success',
            errorMessage: null,
            listingsFound: 30,
            newListings: 1,
            executionLog: [],
          },
        ]),
      );

      const detail = healthStorage.getJobHealth('j1');
      expect(detail.runs[0].totalListingsFound).toBe(80);
      expect(detail.runs[0].totalNewListings).toBe(4);
    });
  });

  describe('getRunDetail', () => {
    it('returns null for non-existent run', () => {
      insertJob('j1');
      const result = healthStorage.getRunDetail('j1', 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when run belongs to different job', () => {
      insertJob('j1');
      insertJob('j2');
      const runId = healthStorage.recordJobRun(makeRun('j1', 'success', 1000));
      const result = healthStorage.getRunDetail('j2', runId);
      expect(result).toBeNull();
    });

    it('returns full execution log', () => {
      insertJob('j1');
      const log = [
        { stage: 'extraction', status: 'success', duration_ms: 100, message: 'Extracted 50', details: { count: 50 } },
        { stage: 'normalization', status: 'success', duration_ms: 10, message: 'Normalized 50', details: null },
      ];
      const runId = healthStorage.recordJobRun(
        makeRun('j1', 'success', 1000, [
          {
            providerId: 'immoscout',
            status: 'success',
            errorMessage: null,
            listingsFound: 50,
            newListings: 3,
            executionLog: log,
          },
        ]),
      );

      const detail = healthStorage.getRunDetail('j1', runId);
      expect(detail.runId).toBe(runId);
      expect(detail.jobId).toBe('j1');
      expect(detail.status).toBe('success');
      expect(detail.providers).toHaveLength(1);
      expect(detail.providers[0].executionLog).toEqual(log);
      expect(detail.totalListingsFound).toBe(50);
      expect(detail.totalNewListings).toBe(3);
    });
  });

  describe('cascade delete', () => {
    it('deleting a job removes all runs and provider records', () => {
      insertJob('j1');
      for (let i = 1; i <= 5; i++) {
        healthStorage.recordJobRun(makeRun('j1', 'success', i * 1000));
      }

      expect(db.prepare('SELECT COUNT(*) AS cnt FROM job_runs').get().cnt).toBe(5);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM job_run_providers').get().cnt).toBe(5);

      db.prepare('DELETE FROM jobs WHERE id = ?').run('j1');

      expect(db.prepare('SELECT COUNT(*) AS cnt FROM job_runs').get().cnt).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM job_run_providers').get().cnt).toBe(0);
    });
  });
});
