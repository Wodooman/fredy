/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Add job_runs and job_run_providers tables for health tracking.
// Stores the last 20 runs per job with per-provider execution logs.
export function up(db) {
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

  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_runs_job_id     ON job_runs(job_id)`);
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
