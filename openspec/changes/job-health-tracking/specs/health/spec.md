# Delta Spec: Health — Job Health Tracking

## ADDED Requirements

### Data Model

#### REQ-HEALTH-001: Job Runs Table
The system SHALL store job run records in a `job_runs` table with the following columns:
- `id` (TEXT PRIMARY KEY) — nanoid
- `job_id` (TEXT NOT NULL, FK → jobs.id ON DELETE CASCADE)
- `status` (TEXT NOT NULL) — `'success'` or `'failure'`
- `started_at` (INTEGER NOT NULL) — epoch milliseconds
- `finished_at` (INTEGER NOT NULL) — epoch milliseconds
- `provider_count` (INTEGER NOT NULL) — total providers attempted
- `failed_provider_count` (INTEGER NOT NULL) — providers that failed
- `total_listings_found` (INTEGER NOT NULL DEFAULT 0) — sum of listings extracted across all providers
- `total_new_listings` (INTEGER NOT NULL DEFAULT 0) — sum of new listings across all providers

The table SHALL have indexes on `job_id` and `started_at`.

#### REQ-HEALTH-002: Job Run Providers Table
The system SHALL store per-provider execution results in a `job_run_providers` table with the following columns:
- `id` (TEXT PRIMARY KEY) — nanoid
- `run_id` (TEXT NOT NULL, FK → job_runs.id ON DELETE CASCADE)
- `provider_id` (TEXT NOT NULL) — provider identifier (e.g., `'immoscout'`)
- `status` (TEXT NOT NULL) — `'success'` or `'failure'`
- `error_message` (TEXT) — error message if failed, NULL if success
- `listings_found` (INTEGER NOT NULL DEFAULT 0) — total listings extracted from page
- `new_listings` (INTEGER NOT NULL DEFAULT 0) — new listings not seen before
- `execution_log` (TEXT NOT NULL) — JSON-encoded structured execution trace

The table SHALL have an index on `run_id`.

#### REQ-HEALTH-003: Run Window Enforcement
The system SHALL keep at most 20 runs per job. When a new run is recorded and the job already has 20 runs, the oldest run (by `started_at`) SHALL be hard-deleted. The deletion of the old run and insertion of the new run SHALL happen within the same database transaction. Cascade delete on `job_runs.id` SHALL automatically remove associated `job_run_providers` rows.

#### REQ-HEALTH-004: Job Deletion Cascade
When a job is deleted, all associated `job_runs` and `job_run_providers` records SHALL be automatically removed via ON DELETE CASCADE.

### Execution Trace

#### REQ-HEALTH-010: Structured Execution Log Format
Each provider execution SHALL produce a structured log stored as JSON in `job_run_providers.execution_log`. The log SHALL be an array of stage entries, each with:
```json
{
  "stage": "string — pipeline stage name",
  "status": "'success' | 'skipped' | 'failure'",
  "duration_ms": "number — milliseconds spent in this stage",
  "message": "string — human-readable summary",
  "details": "object | null — stage-specific data"
}
```

#### REQ-HEALTH-011: Pipeline Stages to Log
The execution trace SHALL capture the following pipeline stages:
1. **`url_preparation`** — URL mutation result
2. **`extraction`** — listings extracted count, or error
3. **`normalization`** — normalized count
4. **`filtering`** — pre-filter count, post-filter count, blacklisted count
5. **`deduplication`** — known hashes count, new listings count
6. **`geocoding`** — geocoded count, failed count
7. **`storage`** — stored count
8. **`distance`** — calculated count, skipped count
9. **`similarity`** — filtered count, kept count
10. **`area_filter`** — filtered count, kept count
11. **`notification`** — adapters notified count, or skipped reason

Each stage's `details` object SHALL include the counts and identifiers relevant to that stage.

#### REQ-HEALTH-012: Provider Success Definition
A provider execution SHALL be considered successful (`status = 'success'`) when the pipeline completes without throwing an error. A `NoNewListingsWarning` SHALL be treated as success (no new listings is a normal outcome). Any other thrown error SHALL result in `status = 'failure'` with the error message captured.

#### REQ-HEALTH-013: Job Run Success Definition
A job run SHALL have `status = 'success'` only when ALL provider executions within the run completed with `status = 'success'`. If at least one provider has `status = 'failure'`, the job run SHALL have `status = 'failure'`.

#### REQ-HEALTH-014: Run Timing
The `started_at` timestamp SHALL be recorded immediately before the first provider begins execution. The `finished_at` timestamp SHALL be recorded immediately after the last provider completes (or fails). Both SHALL use `Date.now()` epoch milliseconds.

### Health Status Derivation

#### REQ-HEALTH-020: Health Status Computation
The system SHALL compute a health status for each job on read from the stored run data. The status SHALL be one of:
- **`green`** — No runs with `status = 'failure'` exist in the last 20 runs
- **`yellow`** — At least one run has `status = 'failure'`, but the most recent run has `status = 'success'`
- **`red`** — The most recent run has `status = 'failure'`
- **`unknown`** — No runs have been recorded yet

#### REQ-HEALTH-021: Health Status for Disabled Jobs
Disabled jobs SHALL still display their health status based on historical run data. The status SHALL NOT change to `unknown` when a job is disabled.

### API

#### REQ-HEALTH-030: Health Overview Endpoint
The system SHALL expose `GET /api/admin/health` returning an array of job health summaries:
```json
[
  {
    "jobId": "string",
    "jobName": "string",
    "enabled": "boolean",
    "healthStatus": "'green' | 'yellow' | 'red' | 'unknown'",
    "lastRunAt": "number | null — epoch ms of most recent run",
    "totalRuns": "number — count of stored runs (0-20)",
    "recentFailures": "number — count of failed runs in window",
    "runs": [
      {
        "runId": "string",
        "status": "'success' | 'failure'",
        "startedAt": "number",
        "finishedAt": "number",
        "providerCount": "number",
        "failedProviderCount": "number",
        "totalListingsFound": "number",
        "totalNewListings": "number"
      }
    ]
  }
]
```

The `runs` array SHALL be ordered by `started_at` descending (most recent first).

#### REQ-HEALTH-031: Job Health Detail Endpoint
The system SHALL expose `GET /api/admin/health/:jobId` returning the full run history for a specific job, including the summary fields from REQ-HEALTH-030 plus the `runs` array with provider-level summaries per run:
```json
{
  "jobId": "string",
  "jobName": "string",
  "enabled": "boolean",
  "healthStatus": "'green' | 'yellow' | 'red' | 'unknown'",
  "runs": [
    {
      "runId": "string",
      "status": "'success' | 'failure'",
      "startedAt": "number",
      "finishedAt": "number",
      "totalListingsFound": "number",
      "totalNewListings": "number",
      "providers": [
        {
          "providerId": "string",
          "status": "'success' | 'failure'",
          "errorMessage": "string | null",
          "listingsFound": "number",
          "newListings": "number"
        }
      ]
    }
  ]
}
```

#### REQ-HEALTH-032: Run Detail Endpoint
The system SHALL expose `GET /api/admin/health/:jobId/runs/:runId` returning the full execution log for a specific run:
```json
{
  "runId": "string",
  "jobId": "string",
  "status": "'success' | 'failure'",
  "startedAt": "number",
  "finishedAt": "number",
  "totalListingsFound": "number",
  "totalNewListings": "number",
  "providers": [
    {
      "providerId": "string",
      "status": "'success' | 'failure'",
      "errorMessage": "string | null",
      "listingsFound": "number",
      "newListings": "number",
      "executionLog": ["array of stage entries per REQ-HEALTH-010"]
    }
  ]
}
```

#### REQ-HEALTH-033: Admin-Only Access
All health endpoints SHALL be protected by both `authInterceptor` and `adminInterceptor`. Non-admin users SHALL receive HTTP 403.

#### REQ-HEALTH-034: SSE Health Updates
After a job run completes and is recorded, the system SHALL emit an SSE event of type `healthUpdate` to all connected admin users. The event payload SHALL include the job ID and the updated health status.

### UI

#### REQ-HEALTH-040: Health Navigation Item
The system SHALL add a "Health" item to the sidebar navigation, visible only to admin users. It SHALL use the `IconPulse` (or equivalent heartbeat/activity icon) and navigate to `/health`.

#### REQ-HEALTH-041: Health Overview Page
The Health page SHALL display a table of all jobs with the following columns:
- **Status** — Color-coded indicator (green/yellow/red/grey circle or badge)
- **Job Name** — Clickable, navigates to job health detail
- **Last Run** — Relative timestamp (e.g., "3 minutes ago")
- **Listings** — Total listings found / new listings from the most recent run (e.g., "142 found, 3 new")
- **Runs** — Mini timeline visualization showing the last 20 runs as small colored dots/bars (green for success, red for failure)
- **Failures** — Count of failed runs in the window (e.g., "2 / 20")

The table SHALL be sorted by health status severity by default: red first, then yellow, then green, then unknown.

#### REQ-HEALTH-042: Color Coding Specification
The health status colors SHALL be:
- **Green** (`#00b42a` or Semi Design `--semi-color-success`) — healthy
- **Yellow** (`#ff7d00` or Semi Design `--semi-color-warning`) — degraded
- **Red** (`#f53f3f` or Semi Design `--semi-color-danger`) — failing
- **Grey** (`#86909c` or Semi Design `--semi-color-text-3`) — unknown

#### REQ-HEALTH-043: Job Health Detail View
Clicking a job name on the Health page SHALL navigate to `/health/:jobId` showing:
- Job name and current health status badge
- Whether the job is enabled/disabled
- A list of the last 20 runs, each showing:
  - Run timestamp
  - Duration (finished_at - started_at)
  - Overall status badge
  - Listing counts (total found / new) aggregated across all providers
  - Per-provider status badges (provider name + green/red indicator)
  - Expandable to show provider-level summary (listings found, new listings, error message)

#### REQ-HEALTH-044: Run Detail View
Clicking a run entry SHALL expand or navigate to show the full execution log for that run. Each provider SHALL display its stage-by-stage execution trace in a structured, readable format:
- Stage name
- Status indicator (success/skipped/failure)
- Duration
- Summary message
- Expandable details (counts, error stack traces, etc.)

#### REQ-HEALTH-045: Real-Time Updates
The Health page SHALL subscribe to SSE `healthUpdate` events and update the displayed status in real time without requiring a page refresh.

#### REQ-HEALTH-046: Admin-Only Route
The `/health` and `/health/:jobId` routes SHALL be wrapped in `PermissionAwareRoute` requiring admin access. Non-admin users navigating to these routes SHALL be redirected to `/403`.

## ADDED Scenarios

#### Scenario: First run of a new job
- GIVEN a job with no previous runs
- WHEN the health overview is loaded
- THEN the job shows `unknown` status (grey indicator)
- AND the runs timeline is empty
- AND failures count shows "0 / 0"

#### Scenario: All runs successful
- GIVEN a job with 15 recorded runs, all with `status = 'success'`
- WHEN the health overview is loaded
- THEN the job shows `green` status
- AND the timeline shows 15 green dots
- AND failures count shows "0 / 15"

#### Scenario: Recent failure (red)
- GIVEN a job with 20 runs where the most recent has `status = 'failure'`
- WHEN the health overview is loaded
- THEN the job shows `red` status

#### Scenario: Recovered from failure (yellow)
- GIVEN a job with 20 runs where run #3 (3rd most recent) has `status = 'failure'` but the most recent run has `status = 'success'`
- WHEN the health overview is loaded
- THEN the job shows `yellow` status

#### Scenario: Window enforcement — 21st run deletes oldest
- GIVEN a job with exactly 20 stored runs
- WHEN a new (21st) run completes and is recorded
- THEN the oldest run (and its provider records) are deleted
- AND exactly 20 runs remain in the database for that job

#### Scenario: Provider failure makes run red
- GIVEN a job with 2 providers: immoscout and immowelt
- WHEN immoscout succeeds but immowelt throws a network error
- THEN the run is recorded with `status = 'failure'`
- AND the immoscout provider entry has `status = 'success'`
- AND the immowelt provider entry has `status = 'failure'` with the error message

#### Scenario: NoNewListingsWarning is success
- GIVEN a provider execution where the pipeline throws `NoNewListingsWarning`
- WHEN the run is recorded
- THEN the provider entry has `status = 'success'`
- AND the execution log shows the deduplication stage as successful with 0 new listings

#### Scenario: Run detail shows full trace
- GIVEN a completed run with 2 providers
- WHEN an admin navigates to the run detail
- THEN each provider shows its execution log with all 11 pipeline stages
- AND each stage shows status, duration, and relevant counts

#### Scenario: Disabled job retains health history
- GIVEN a job that was disabled after 10 runs (3 failures)
- WHEN the health overview is loaded
- THEN the job appears with `yellow` or `red` status (depending on last run)
- AND the runs timeline shows 10 entries

#### Scenario: Job deletion cascades to runs
- GIVEN a job with 15 runs (and associated provider records)
- WHEN the job is deleted
- THEN all `job_runs` and `job_run_providers` rows for that job are removed

#### Scenario: Admin-only access enforced
- GIVEN a non-admin user
- WHEN they request `GET /api/admin/health`
- THEN they receive HTTP 403

#### Scenario: SSE real-time update
- GIVEN an admin viewing the Health page
- WHEN a job run completes
- THEN the page updates the job's status and timeline without a refresh
