# Proposal: Job Health Tracking

## Problem

Fredy currently has no visibility into whether jobs are running successfully over time. Logs go to stdout and are lost. When a provider breaks (e.g., a site changes its HTML structure), users discover it only when they stop receiving notifications — which could be days later. There is no way to see historical execution results, identify flaky providers, or diagnose failures without SSH access to the server.

## Intent

Add a health tracking system that records the last 20 runs of each job, provides at-a-glance color-coded status indicators, and allows admins to drill into full execution logs for each run. This gives admins confidence that the system is working and fast diagnosis when it isn't.

## Approach

### Data Model

Introduce two new database tables:

- **`job_runs`** — One row per job execution (a "run"). Tracks overall status (success/failure), timestamp, and duration. A run is successful only if all its provider executions succeeded.
- **`job_run_providers`** — One row per provider execution within a run. Tracks provider-level status, error messages, listing counts, and a full structured execution log.

The window is capped at 20 runs per job. When a 21st run is inserted, the oldest run (and its provider rows) are hard-deleted in the same transaction.

### Execution Integration

The `jobExecutionService` and `FredyPipelineExecutioner` are instrumented to capture structured execution traces. Each pipeline stage records its outcome (listings extracted, filtered, stored, notified, etc.) and any errors. The trace is written to the database after the run completes.

### Health Status Derivation

Health status is computed on read, not stored:

- **Green** — No failures in the last 20 runs
- **Yellow** — At least one failure in the last 20 runs, but the most recent run succeeded
- **Red** — The most recent run had at least one provider failure

### UI

A new admin-only "Health" page in the sidebar shows all jobs with their color-coded status, a mini timeline of the last 20 runs, and expandable detail views for each run showing per-provider logs.

### API

New admin-only endpoints serve health data:

- `GET /api/admin/health` — All jobs with status summary
- `GET /api/admin/health/:jobId` — Last 20 runs for a specific job
- `GET /api/admin/health/:jobId/runs/:runId` — Full execution log for a specific run

## Scope

### In Scope

- Database schema for job runs and provider execution logs
- Pipeline instrumentation to capture structured execution traces
- Hard-delete cleanup of runs beyond the 20-run window
- Admin-only API endpoints for health data
- Admin-only Health page with color-coded job status
- Per-run detail view with per-provider execution logs
- SSE integration for real-time health updates after runs complete

### Out of Scope

- Alerting/notifications when jobs fail (future enhancement)
- Non-admin access to health data
- Configurable window size (hardcoded at 20)
- Historical analytics beyond the 20-run window
- Export/download of logs
