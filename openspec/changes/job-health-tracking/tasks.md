# Tasks: Job Health Tracking

## Phase 1: Database & Storage Layer

- [x] **1.1** Create migration `13.job-health-tracking.js` — `job_runs` and `job_run_providers` tables with indexes and FK cascades
- [x] **1.2** Create `lib/services/storage/healthStorage.js` — storage functions:
  - `recordJobRun(run)` — insert run + provider rows, enforce 20-run window (delete oldest in same transaction)
  - `getHealthOverview()` — all jobs with run summaries and computed health status
  - `getJobHealth(jobId)` — single job with runs + provider summaries
  - `getRunDetail(jobId, runId)` — single run with full provider execution logs
- [x] **1.3** Write tests for `healthStorage` — window enforcement (21st run deletes oldest), cascade delete, health status computation (green/yellow/red/unknown), empty state

## Phase 2: Pipeline Instrumentation

- [x] **2.1** Create `lib/services/jobs/executionTracer.js` — tracer class that records stage name, status, duration, message, and details for each pipeline stage
- [x] **2.2** Instrument `FredyPipelineExecutioner` — wrap each pipeline stage to feed the tracer with outcomes (listings counts, filter counts, errors). `NoNewListingsWarning` recorded as success with 0 new listings
- [x] **2.3** Instrument `jobExecutionService.executeJob()` — create a run record before providers start, collect per-provider tracer results, write the completed run to `healthStorage.recordJobRun()` in the `finally` block
- [x] **2.4** Write tests for execution tracing — success path, failure path, `NoNewListingsWarning` path, multi-provider mixed results

## Phase 3: API

- [x] **3.1** Create `lib/api/routes/healthRouter.js` with three endpoints:
  - `GET /api/admin/health` — calls `getHealthOverview()`
  - `GET /api/admin/health/:jobId` — calls `getJobHealth(jobId)`
  - `GET /api/admin/health/:jobId/runs/:runId` — calls `getRunDetail(jobId, runId)`
- [x] **3.2** Register health router in `api.js` with `authInterceptor` + `adminInterceptor`
- [x] **3.3** Add SSE `healthUpdate` event — emit from `jobExecutionService` after run is recorded, targeting admin users only
- [x] **3.4** Tests covered via healthStorage integration tests (admin access enforced by existing `/api/admin` middleware chain)

## Phase 4: Frontend — State & Data

- [x] **4.1** Add `healthData` slice to Zustand store — state shape (`overview`, `jobDetail`, `runDetail`) and actions (`getHealthOverview`, `getJobHealth`, `getRunDetail`, `updateJobHealth`)
- [x] **4.2** Add SSE `healthUpdate` listener — in HealthGrid and JobHealthDetail components

## Phase 5: Frontend — Health Overview Page

- [x] **5.1** Create `RunTimeline` component — 20 dots (green/red/grey-outline), hover tooltip, click handler
- [x] **5.2** Create `HealthKpiRow` component — 4 KPI cards (Total, Healthy, Degraded, Failing) using existing `KpiCard`
- [x] **5.3** Create `HealthGrid` component — filter bar (search, status radio, sort select, direction toggle), job health cards with stats row and `RunTimeline`, pagination, empty state
- [x] **5.4** Create `Health` page view (`ui/src/views/health/Health.jsx`) — wraps `HealthKpiRow` + `HealthGrid`
- [x] **5.5** Create `Health.less` and `HealthGrid.less` — styling for cards, timeline dots, stats, hover effects matching existing patterns

## Phase 6: Frontend — Job Health Detail Page

- [x] **6.1** Create `ProviderRunSummary` component — provider name, status dot, listing counts, error banner if failed, "View Log" button
- [x] **6.2** Create `ExecutionLogModal` component — modal showing stage-by-stage trace with status dots, durations, messages, expandable details
- [x] **6.3** Create `RunCard` component — collapsible card with summary header (status, timestamp, duration, listing counts, provider badges) and expanded provider detail sections
- [x] **6.4** Create `JobHealthDetail` page view (`ui/src/views/health/JobHealthDetail.jsx`) — back button, header card with status badge + timeline, run list using `RunCard`, auto-expand from `?run=` query param
- [x] **6.5** Create `JobHealthDetail.less` — styling for run cards, provider sections, log modal

## Phase 7: Routing & Navigation

- [x] **7.1** Add "Health" item to sidebar navigation — admin-only, with `IconActivity` icon, navigates to `/health`
- [x] **7.2** Add routes in `App.jsx` — `/health` and `/health/:jobId` wrapped in `PermissionAwareRoute`
- [ ] **7.3** Load health overview data on app init for admin users (in `App.jsx` init block) — *deferred: data loads on page visit instead*

## Phase 8: Integration Testing & Polish

- [x] **8.1** Integration tests: healthStorage covers recording runs, querying overview/detail/run-detail
- [x] **8.2** 20-run window verified in healthStorage tests (21st run deletes oldest, per-job isolation)
- [x] **8.3** Cascade delete verified in healthStorage tests (delete job removes all runs and providers)
- [x] **8.4** SSE health updates emitted in jobExecutionService, listened to in HealthGrid and JobHealthDetail
- [ ] **8.5** Manual UI review: check color coding, timeline rendering, modal behavior, responsive layout, empty states
