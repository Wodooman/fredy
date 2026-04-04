# 🩺 Health Monitoring

Fredy tracks the execution history of every job, giving admins at-a-glance visibility into whether scraping is working correctly. The Health page shows the last 20 runs of each job with color-coded status indicators, per-provider breakdowns, and full execution logs.

> **Note:** Health monitoring is available to **admin users only**.

------------------------------------------------------------------------

## How It Works

Every time a job runs (scheduled or manual), Fredy records a **run** containing:

- Overall status (success / failure)
- Timestamps and duration
- Per-provider results: status, listings found, new listings, and a stage-by-stage execution trace

Fredy keeps the **last 20 runs** per job. When a 21st run completes, the oldest run is automatically deleted. There is no configuration for the window size — it is fixed at 20.

------------------------------------------------------------------------

## Health Status Colors

Each job is assigned a health status based on its run history:

| Status | Color | Meaning |
|--------|-------|---------|
| **Healthy** | 🟢 Green | No failures in the last 20 runs |
| **Degraded** | 🟡 Yellow | At least one failure in the last 20 runs, but the most recent run succeeded |
| **Failing** | 🔴 Red | The most recent run failed |
| **Unknown** | ⚪ Grey | No runs recorded yet |

### What counts as a failure?

A **provider execution fails** when it throws an error — network timeouts, connection resets, broken selectors, unexpected HTML, etc.

A **provider execution succeeds** when it completes the scraping pipeline without errors. Finding zero new listings is **not** a failure — it simply means all listings were already known.

A **job run fails** if **any** of its providers fail. All providers must succeed for the run to be green.

------------------------------------------------------------------------

## The Health Page

Navigate to **Health** in the sidebar (visible to admins only).

### Overview

The overview shows:

- **KPI cards** — Total jobs with run data, healthy count, degraded count, failing count
- **Job cards** — Each job shows its status dot, name, last run time, listings found/new from the latest run, failure count, and a timeline of the last 20 runs as colored dots
- **Filters** — Search by name, filter by status (All / Healthy / Degraded / Failing), sort by severity, name, last run, or failure count

### Job Detail

Click a job card to see its full run history:

- **Header** — Job name, health status badge, enabled/disabled, provider count, last run time, and the 20-dot timeline
- **Run list** — Each run shows timestamp, duration, total listings found/new, provider badges (green/red), and a summary line. Runs are collapsed by default.

### Expanding a Run

Click a run to expand it and see per-provider details:

- Provider name and status
- Listings found and new listings count
- Error message (for failed providers, shown in a red banner)
- **View Log** button to open the full execution trace

### Execution Log

The execution log shows the complete pipeline trace for a single provider run — all 11 stages:

| # | Stage | What it records |
|---|-------|-----------------|
| 1 | URL Preparation | URL mutation with sort parameters |
| 2 | Extraction | Raw listings scraped from the page |
| 3 | Normalization | Listings converted to standard format |
| 4 | Filtering | Blacklisted/incomplete listings removed |
| 5 | Deduplication | New vs. already-known listings |
| 6 | Geocoding | Addresses converted to coordinates |
| 7 | Storage | Listings saved to database |
| 8 | Distance | Distance from home address calculated |
| 9 | Similarity | Cross-platform duplicate detection |
| 10 | Area Filter | Spatial polygon filter applied |
| 11 | Notification | Alerts sent via configured adapters |

Each stage shows its status (success/failure/skipped), duration, and a summary message. Click a stage to expand its raw details.

### Real-Time Updates

The Health page updates automatically via Server-Sent Events (SSE). When a job finishes running, the page refreshes without requiring a manual reload.

------------------------------------------------------------------------

## API Endpoints

All endpoints require admin authentication.

### `GET /api/admin/health`

Returns health summaries for all jobs.

```json
[
  {
    "jobId": "abc123",
    "jobName": "Berlin Apartments",
    "enabled": true,
    "healthStatus": "green",
    "lastRunAt": 1712345678000,
    "totalRuns": 20,
    "recentFailures": 0,
    "runs": [
      {
        "runId": "run1",
        "status": "success",
        "startedAt": 1712345678000,
        "finishedAt": 1712345690000,
        "providerCount": 2,
        "failedProviderCount": 0,
        "totalListingsFound": 142,
        "totalNewListings": 3
      }
    ]
  }
]
```

### `GET /api/admin/health/:jobId`

Returns detailed run history for a single job, including per-provider summaries.

### `GET /api/admin/health/:jobId/runs/:runId`

Returns the full execution log for a single run, including the stage-by-stage trace for each provider.

------------------------------------------------------------------------

## Database

Health data is stored in two tables added by migration `13.job-health-tracking.js`:

- **`job_runs`** — One row per job execution (status, timestamps, aggregated counts)
- **`job_run_providers`** — One row per provider within a run (status, error message, listings counts, execution log as JSON)

Both tables cascade-delete when the parent job is removed. The 20-run window is enforced on insert — no background cleanup job is needed.

Run `yarn migratedb` to apply the migration if upgrading from an earlier version.
