/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';

const MAX_RUNS_PER_JOB = 20;

/**
 * Record a completed job run and its per-provider results.
 * Enforces the 20-run window by deleting the oldest run(s) in the same transaction.
 *
 * @param {Object} run
 * @param {string} run.jobId
 * @param {string} run.status - 'success' or 'failure'
 * @param {number} run.startedAt - epoch ms
 * @param {number} run.finishedAt - epoch ms
 * @param {Array<Object>} run.providers - per-provider results
 * @param {string} run.providers[].providerId
 * @param {string} run.providers[].status - 'success' or 'failure'
 * @param {string|null} run.providers[].errorMessage
 * @param {number} run.providers[].listingsFound
 * @param {number} run.providers[].newListings
 * @param {Array<Object>} run.providers[].executionLog - structured stage trace
 * @returns {string} The id of the newly created run.
 */
export const recordJobRun = (run) => {
  const runId = nanoid();

  const providerCount = run.providers.length;
  const failedProviderCount = run.providers.filter((p) => p.status === 'failure').length;
  const totalListingsFound = run.providers.reduce((sum, p) => sum + (p.listingsFound || 0), 0);
  const totalNewListings = run.providers.reduce((sum, p) => sum + (p.newListings || 0), 0);

  SqliteConnection.withTransaction((db) => {
    // Delete oldest runs beyond the window (keep MAX - 1 so the new one fits)
    const excess = db
      .prepare(
        `SELECT id FROM job_runs
         WHERE job_id = @jobId
         ORDER BY started_at DESC
         LIMIT -1 OFFSET @keep`,
      )
      .all({ jobId: run.jobId, keep: MAX_RUNS_PER_JOB - 1 });

    if (excess.length > 0) {
      const ids = excess.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      // CASCADE will remove job_run_providers rows
      db.prepare(`DELETE FROM job_runs WHERE id IN (${placeholders})`).run(...ids);
    }

    // Insert the new run
    db.prepare(
      `INSERT INTO job_runs (id, job_id, status, started_at, finished_at, provider_count, failed_provider_count, total_listings_found, total_new_listings)
       VALUES (@id, @jobId, @status, @startedAt, @finishedAt, @providerCount, @failedProviderCount, @totalListingsFound, @totalNewListings)`,
    ).run({
      id: runId,
      jobId: run.jobId,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      providerCount,
      failedProviderCount,
      totalListingsFound,
      totalNewListings,
    });

    // Insert provider results
    const insertProvider = db.prepare(
      `INSERT INTO job_run_providers (id, run_id, provider_id, status, error_message, listings_found, new_listings, execution_log)
       VALUES (@id, @runId, @providerId, @status, @errorMessage, @listingsFound, @newListings, @executionLog)`,
    );
    for (const prov of run.providers) {
      insertProvider.run({
        id: nanoid(),
        runId,
        providerId: prov.providerId,
        status: prov.status,
        errorMessage: prov.errorMessage || null,
        listingsFound: prov.listingsFound || 0,
        newListings: prov.newListings || 0,
        executionLog: JSON.stringify(prov.executionLog || []),
      });
    }
  });

  return runId;
};

/**
 * Compute health status from an array of runs (must be sorted by started_at DESC).
 * @param {Array<{status: string}>} runs
 * @returns {'green'|'yellow'|'red'|'unknown'}
 */
function computeHealthStatus(runs) {
  if (!runs || runs.length === 0) return 'unknown';
  const latestStatus = runs[0].status;
  const hasFailure = runs.some((r) => r.status === 'failure');

  if (latestStatus === 'failure') return 'red';
  if (hasFailure) return 'yellow';
  return 'green';
}

/**
 * Get health overview for all jobs.
 * Returns job metadata + run summaries + computed health status.
 *
 * @returns {Array<Object>}
 */
export const getHealthOverview = () => {
  const jobs = SqliteConnection.query(
    `SELECT j.id, j.name, j.enabled
     FROM jobs j
     ORDER BY j.name IS NULL, j.name`,
  );

  const runs = SqliteConnection.query(
    `SELECT id, job_id, status, started_at, finished_at, provider_count, failed_provider_count, total_listings_found, total_new_listings
     FROM job_runs
     ORDER BY started_at DESC`,
  );

  // Group runs by job_id
  const runsByJob = new Map();
  for (const run of runs) {
    if (!runsByJob.has(run.job_id)) {
      runsByJob.set(run.job_id, []);
    }
    runsByJob.get(run.job_id).push(run);
  }

  return jobs.map((job) => {
    const jobRuns = runsByJob.get(job.id) || [];
    const healthStatus = computeHealthStatus(jobRuns);
    const recentFailures = jobRuns.filter((r) => r.status === 'failure').length;

    return {
      jobId: job.id,
      jobName: job.name,
      enabled: !!job.enabled,
      healthStatus,
      lastRunAt: jobRuns.length > 0 ? jobRuns[0].started_at : null,
      totalRuns: jobRuns.length,
      recentFailures,
      runs: jobRuns.map((r) => ({
        runId: r.id,
        status: r.status,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        providerCount: r.provider_count,
        failedProviderCount: r.failed_provider_count,
        totalListingsFound: r.total_listings_found,
        totalNewListings: r.total_new_listings,
      })),
    };
  });
};

/**
 * Get health detail for a single job including per-provider summaries per run.
 *
 * @param {string} jobId
 * @returns {Object|null}
 */
export const getJobHealth = (jobId) => {
  const job = SqliteConnection.query(`SELECT id, name, enabled FROM jobs WHERE id = @jobId LIMIT 1`, { jobId })[0];
  if (!job) return null;

  const runs = SqliteConnection.query(
    `SELECT id, status, started_at, finished_at, provider_count, failed_provider_count, total_listings_found, total_new_listings
     FROM job_runs
     WHERE job_id = @jobId
     ORDER BY started_at DESC`,
    { jobId },
  );

  let providerRows = [];
  if (runs.length > 0) {
    // Use the DB connection directly for positional params with IN clause
    const runIds = runs.map((r) => r.id);
    const placeholders = runIds.map(() => '?').join(',');
    const db = SqliteConnection.getConnection();
    providerRows = db
      .prepare(
        `SELECT run_id, provider_id, status, error_message, listings_found, new_listings
         FROM job_run_providers
         WHERE run_id IN (${placeholders})`,
      )
      .all(...runIds);
  }

  // Group providers by run_id
  const providersByRun = new Map();
  for (const p of providerRows) {
    if (!providersByRun.has(p.run_id)) {
      providersByRun.set(p.run_id, []);
    }
    providersByRun.get(p.run_id).push(p);
  }

  const healthStatus = computeHealthStatus(runs);

  return {
    jobId: job.id,
    jobName: job.name,
    enabled: !!job.enabled,
    healthStatus,
    runs: runs.map((r) => ({
      runId: r.id,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      totalListingsFound: r.total_listings_found,
      totalNewListings: r.total_new_listings,
      providers: (providersByRun.get(r.id) || []).map((p) => ({
        providerId: p.provider_id,
        status: p.status,
        errorMessage: p.error_message,
        listingsFound: p.listings_found,
        newListings: p.new_listings,
      })),
    })),
  };
};

/**
 * Get full detail for a single run, including execution logs.
 *
 * @param {string} jobId
 * @param {string} runId
 * @returns {Object|null}
 */
export const getRunDetail = (jobId, runId) => {
  const run = SqliteConnection.query(
    `SELECT id, job_id, status, started_at, finished_at, total_listings_found, total_new_listings
     FROM job_runs
     WHERE id = @runId AND job_id = @jobId
     LIMIT 1`,
    { runId, jobId },
  )[0];
  if (!run) return null;

  const providers = SqliteConnection.query(
    `SELECT provider_id, status, error_message, listings_found, new_listings, execution_log
     FROM job_run_providers
     WHERE run_id = @runId`,
    { runId },
  );

  return {
    runId: run.id,
    jobId: run.job_id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    totalListingsFound: run.total_listings_found,
    totalNewListings: run.total_new_listings,
    providers: providers.map((p) => ({
      providerId: p.provider_id,
      status: p.status,
      errorMessage: p.error_message,
      listingsFound: p.listings_found,
      newListings: p.new_listings,
      executionLog: JSON.parse(p.execution_log || '[]'),
    })),
  };
};
