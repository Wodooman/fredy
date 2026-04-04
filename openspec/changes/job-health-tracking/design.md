# Design: Job Health Tracking — UX

## Page Structure

The Health feature introduces two views: the **Health Overview** page (`/health`) and the **Job Health Detail** page (`/health/:jobId`). Both are admin-only.

---

## Health Overview Page (`/health`)

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Health                                                     [KPIs] │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Total    │  │ Healthy  │  │ Degraded │  │ Failing  │           │
│  │ Jobs: 12 │  │ 8  (grn) │  │ 2  (ylw) │  │ 2  (red) │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [Search________] [All|Healthy|Degraded|Failing] [Sort ▼]   │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                             │   │
│  │  ┌─ Job Card ──────────────────────────────────────────┐   │   │
│  │  │  ● Job Name                           3 min ago     │   │   │
│  │  │                                                      │   │   │
│  │  │  142 found  │  3 new  │  2 providers  │  0 failures │   │   │
│  │  │                                                      │   │   │
│  │  │  Runs: ●●●●●●●●●●●●●●●●●●●●  (20 dots)            │   │   │
│  │  │        ▲ hover tooltip: "Run #18 — Success — Apr 4"  │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  │  ┌─ Job Card ──────────────────────────────────────────┐   │   │
│  │  │  ● Job Name                          15 min ago     │   │   │
│  │  │  ...                                                 │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### KPI Summary Row

Four KPI cards at the top using the existing `KpiCard` component and color scheme:

| Card | Color | Icon | Value |
|------|-------|------|-------|
| Total Jobs | Blue | `IconTerminal` | Count of all jobs with at least one run |
| Healthy | Green | `IconCheckCircle` | Count of jobs with `green` status |
| Degraded | Orange/Yellow | `IconAlertTriangle` | Count of jobs with `yellow` status |
| Failing | Red | `IconAlertCircle` | Count of jobs with `red` status |

Jobs with `unknown` status (no runs yet) are counted in "Total Jobs" but not in any health bucket. The "Total Jobs" description line shows "N never run" if any exist.

### Filter Bar

Positioned above the card grid, matching the existing filter bar pattern from Jobs and Listings pages:

| Control | Type | Behavior |
|---------|------|----------|
| Search | `Input` with `IconSearch` prefix | Free-text filter on job name, debounced 500ms |
| Status Filter | `RadioGroup` (button style) | Options: All / Healthy / Degraded / Failing |
| Sort | `Select` | Fields: Status Severity, Job Name, Last Run, Failure Count |
| Sort Direction | `Button` toggle | Ascending / Descending with arrow icon |

All filter state is persisted in URL query parameters via `useSearchParamState` so that links are shareable and browser back/forward work correctly.

Default sort: **Status Severity descending** (red first, then yellow, then green, then unknown).

### Job Health Cards

Card-based grid layout matching the existing pattern. Responsive columns: `xs={24} sm={24} md={12} lg={12} xl={8} xxl={6}`.

Each card contains:

**Header Row:**
- **Status dot** — Colored circle (green/yellow/red/grey) left of the job name
- **Job name** — Bold, clickable, navigates to `/health/:jobId`
- **Last run timestamp** — Right-aligned, relative format ("3 min ago"), with absolute timestamp in tooltip
- **Disabled badge** — If job is disabled, a subtle `Tag` reading "Disabled" appears next to the name

**Stats Row:**
Four inline stats using icon + value pairs, matching the existing job card stat pattern:

| Stat | Icon | Example | Color |
|------|------|---------|-------|
| Listings found | `IconHome` | 142 | Blue |
| New listings | `IconPlusCircle` | 3 | Green |
| Providers | `IconBriefcase` | 2 | Orange |
| Failures | `IconAlertCircle` | 0 | Red (or grey if 0) |

"Listings found" and "New listings" are from the **most recent run**. "Failures" is the count of failed runs across the entire 20-run window.

**Run Timeline:**
A horizontal row of up to 20 small dots (8px circles), ordered left-to-right from oldest to newest:

```
●●●●●●●●●●●●●●●●●●●●
oldest →           newest
```

- Green dot (`--semi-color-success`): successful run
- Red dot (`--semi-color-danger`): failed run
- Empty placeholder dots (grey outline, no fill): if fewer than 20 runs exist, remaining slots shown as hollow circles to maintain consistent width

**Hover interaction on dots:** A `Tooltip` shows:
- Run number (e.g., "Run #18")
- Status ("Success" or "Failure")
- Timestamp (absolute, e.g., "Apr 4, 14:23")
- Duration (e.g., "took 12s")
- If failure: short error summary (first failed provider name)

**Click interaction on dots:** Clicking a dot navigates to the run detail within the job health detail page (`/health/:jobId?run=:runId`).

### Empty State

When no jobs exist or none have runs yet, show the `Empty` component with `IllustrationNoResult` and the message "No health data available yet. Jobs will appear here after their first run."

### Real-Time Updates

The page subscribes to the SSE endpoint and listens for `healthUpdate` events. When received:
1. The affected job's card updates its status dot color, stats, and timeline without a full page reload
2. A subtle toast confirms: "Job '{name}' completed — {status}"

---

## Job Health Detail Page (`/health/:jobId`)

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back to Health                                                   │
│                                                                     │
│  ┌─ Header ────────────────────────────────────────────────────┐   │
│  │  ● Job Name                          [Tag: Green/Healthy]   │   │
│  │    Enabled · 2 providers · Last run 3 min ago               │   │
│  │    Runs: ●●●●●●●●●●●●●●●●●●●●                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Run List ──────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │  ┌─ Run #20 (most recent) ────────────────────────────┐    │   │
│  │  │  ● Success   Apr 4, 14:23   Duration: 12s          │    │   │
│  │  │  142 found · 3 new                                  │    │   │
│  │  │                                                     │    │   │
│  │  │  Providers:                                         │    │   │
│  │  │   ● ImmoScout24    ✓  98 found, 2 new              │    │   │
│  │  │   ● Immowelt       ✓  44 found, 1 new              │    │   │
│  │  │                                            [Logs →] │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                             │   │
│  │  ┌─ Run #19 ─────────────────────────────────────────┐     │   │
│  │  │  ● Failure   Apr 4, 13:08   Duration: 45s         │     │   │
│  │  │  98 found · 0 new                                  │     │   │
│  │  │                                                    │     │   │
│  │  │  Providers:                                        │     │
│  │  │   ● ImmoScout24    ✓  98 found, 0 new             │     │   │
│  │  │   ● Immowelt       ✗  Error: Timeout after 30s    │     │   │
│  │  │                                           [Logs →] │     │   │
│  │  └────────────────────────────────────────────────────┘     │   │
│  │                                                             │   │
│  │  ... (up to 20 runs, scrollable)                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Back Navigation

A "Back to Health" button at the top-left using `IconArrowLeft`, matching the pattern from `ListingDetail`.

### Header Card

A single `Card` at the top containing:

- **Status dot + Job name** — Large heading with colored status indicator
- **Health status tag** — A `Tag` with the status label and matching color (e.g., green tag reading "Healthy", yellow tag "Degraded", red tag "Failing")
- **Meta line** — "Enabled/Disabled · N providers · Last run X ago"
- **Run timeline** — Same 20-dot visualization as on the overview cards, but larger (12px dots) with the same hover/click interactions

### Run List

A vertical list of `Card` components, one per run, ordered most-recent-first. Each run card is a `Collapse` panel that is collapsed by default, with the summary visible and details expandable.

If the URL contains `?run=:runId`, that run's card auto-expands on page load and the page scrolls to it.

**Run Card — Collapsed (Always Visible):**

```
┌──────────────────────────────────────────────────────────────┐
│  ● Success/Failure    Apr 4, 14:23    Duration: 12s    [▼]  │
│  142 found · 3 new · 2/2 providers OK                        │
│                                                              │
│  Provider badges:  [ImmoScout24 ✓] [Immowelt ✓]             │
└──────────────────────────────────────────────────────────────┘
```

- **Status dot + label** — Green dot + "Success" or Red dot + "Failure"
- **Timestamp** — Absolute format (e.g., "Apr 4, 14:23")
- **Duration** — `finished_at - started_at`, formatted as seconds/minutes
- **Listing counts** — "N found · M new" from `totalListingsFound` / `totalNewListings`
- **Provider summary** — "X/Y providers OK" (e.g., "2/2 providers OK" or "1/2 providers OK")
- **Provider badges** — Inline `Tag` components per provider, each colored green (success) or red (failure)

**Run Card — Expanded (On Click):**

Expands to show a per-provider detail section:

```
┌──────────────────────────────────────────────────────────────┐
│  ● Success    Apr 4, 14:23    Duration: 12s              [▲] │
│  142 found · 3 new · 2/2 providers OK                        │
│                                                              │
│  ┌─ ImmoScout24 ──────────────────────────────────────────┐ │
│  │  Status: ● Success                                      │ │
│  │  Listings found: 98                                     │ │
│  │  New listings: 2                                        │ │
│  │                                              [View Log] │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Immowelt ─────────────────────────────────────────────┐ │
│  │  Status: ● Failure                                      │ │
│  │  Error: TimeoutError: Navigation timeout of 30000ms     │ │
│  │  Listings found: 0                                      │ │
│  │  New listings: 0                                        │ │
│  │                                              [View Log] │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Each provider section shows:
- Provider name as a sub-heading
- Status with colored dot
- If failure: error message in a red `Banner` component
- Listings found / New listings counts
- **"View Log" button** — Opens the execution log modal for this provider

### Execution Log Modal

Clicking "View Log" on a provider opens a full-screen `Modal` (or `SideSheet` if available) showing the stage-by-stage execution trace. This avoids navigating away from the run list.

```
┌─────────────────────────────────────────────────────────────┐
│  Execution Log — ImmoScout24                           [✕]  │
│  Run #20 · Apr 4, 14:23                                     │
│                                                             │
│  ┌─ Pipeline Stages ───────────────────────────────────┐   │
│  │                                                     │   │
│  │  1. URL Preparation          ● Success    2ms       │   │
│  │     URL mutated with sort parameter                 │   │
│  │                                                     │   │
│  │  2. Extraction               ● Success    3420ms    │   │
│  │     Extracted 98 raw listings                       │   │
│  │                                                     │   │
│  │  3. Normalization            ● Success    12ms      │   │
│  │     Normalized 98 listings                          │   │
│  │                                                     │   │
│  │  4. Filtering                ● Success    5ms       │   │
│  │     98 → 95 (3 blacklisted)                         │   │
│  │                                                     │   │
│  │  5. Deduplication            ● Success    8ms       │   │
│  │     93 known, 2 new                                 │   │
│  │                                                     │   │
│  │  6. Geocoding                ● Success    1240ms    │   │
│  │     2 geocoded, 0 failed                            │   │
│  │                                                     │   │
│  │  7. Storage                  ● Success    15ms      │   │
│  │     Stored 2 listings                               │   │
│  │                                                     │   │
│  │  8. Distance Calculation     ● Success    3ms       │   │
│  │     2 calculated, 0 skipped                         │   │
│  │                                                     │   │
│  │  9. Similarity Filter        ● Success    4ms       │   │
│  │     0 filtered, 2 kept                              │   │
│  │                                                     │   │
│  │  10. Area Filter             ● Skipped    0ms       │   │
│  │      No spatial filter configured                   │   │
│  │                                                     │   │
│  │  11. Notification            ● Success    890ms     │   │
│  │      Notified 2 adapters                            │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Total duration: 5599ms                                     │
└─────────────────────────────────────────────────────────────┘
```

Each stage row shows:
- **Stage number and name**
- **Status indicator** — Green dot (success), grey dot (skipped), red dot (failure)
- **Duration** — Right-aligned
- **Summary message** — One-line human-readable description
- **Expandable details** (click to expand) — For failure stages, shows the full error message and stack trace in a `<pre>` block. For success stages, shows the raw details object as formatted key-value pairs.

The total pipeline duration is shown at the bottom.

---

## Interaction Summary

| Action | Where | Result |
|--------|-------|--------|
| Click job name on overview card | Overview page | Navigate to `/health/:jobId` |
| Click timeline dot on overview card | Overview page | Navigate to `/health/:jobId?run=:runId` |
| Hover timeline dot | Overview or Detail | Tooltip with run summary |
| Click "Back to Health" | Detail page | Navigate to `/health` |
| Click run card header | Detail page | Expand/collapse run details |
| Click provider "View Log" | Detail page (expanded run) | Open execution log modal |
| Close log modal | Log modal | Return to detail page |
| SSE `healthUpdate` received | Overview page | Card updates in-place, toast shown |
| SSE `healthUpdate` received | Detail page | Run list refreshes if matching jobId |
| Filter/sort change | Overview page | URL params update, grid re-renders |

---

## Component Inventory

New components to create:

| Component | Location | Semi Components Used |
|-----------|----------|---------------------|
| `Health` (page) | `ui/src/views/health/Health.jsx` | Layout wrapper |
| `HealthGrid` | `ui/src/components/grid/health/HealthGrid.jsx` | `Row`, `Col`, `Card`, `Input`, `RadioGroup`, `Select`, `Button`, `Empty`, `Tooltip`, `Tag` |
| `HealthKpiRow` | `ui/src/components/grid/health/HealthKpiRow.jsx` | `Row`, `Col`, KpiCard |
| `RunTimeline` | `ui/src/components/grid/health/RunTimeline.jsx` | `Tooltip` (renders inline SVG or styled divs for dots) |
| `JobHealthDetail` (page) | `ui/src/views/health/JobHealthDetail.jsx` | `Card`, `Button`, `Tag`, `Typography`, `Collapse`, `Banner`, `Spin` |
| `RunCard` | `ui/src/components/grid/health/RunCard.jsx` | `Card`, `Collapse`, `Tag`, `Typography`, `Space`, `Descriptions` |
| `ProviderRunSummary` | `ui/src/components/grid/health/ProviderRunSummary.jsx` | `Tag`, `Banner`, `Button`, `Descriptions` |
| `ExecutionLogModal` | `ui/src/components/grid/health/ExecutionLogModal.jsx` | `Modal`, `Typography`, `Tag`, `Collapse` |

Reused existing components:
- `KpiCard` (from dashboard)
- `PermissionAwareRoute` (for admin gating)
- `Navigation` (add new item)

---

## State Management

New Zustand slice `healthData`:

```javascript
healthData: {
  overview: [],         // array of job health summaries from GET /api/admin/health
  jobDetail: null,      // single job detail from GET /api/admin/health/:jobId
  runDetail: null,      // single run detail from GET /api/admin/health/:jobId/runs/:runId
}
```

Actions:
- `getHealthOverview()` — Fetches overview, stores in `overview`
- `getJobHealth(jobId)` — Fetches job detail, stores in `jobDetail`
- `getRunDetail(jobId, runId)` — Fetches run detail, stores in `runDetail`
- `updateJobHealth(jobId, healthStatus)` — SSE-driven partial update of a single job in `overview`

---

## SSE Integration

The Health Overview page opens an `EventSource` to `/api/jobs/events` (same endpoint as Jobs page) and listens for `healthUpdate` events:

```javascript
src.addEventListener('healthUpdate', (e) => {
  const { jobId, healthStatus, latestRun } = JSON.parse(e.data);
  actions.healthData.updateJobHealth(jobId, healthStatus, latestRun);
});
```

The Job Health Detail page also listens and appends new runs if the current `jobId` matches.

---

## Key UX Decisions

### Cards over Tables
Consistent with Jobs and Listings pages. Cards provide more visual space for the timeline visualization and stats than table rows would.

### Modal for Execution Logs (not a separate page)
The execution log is dense diagnostic data. A modal keeps the user in context of the run list so they can quickly compare logs across runs or providers without navigating back and forth.

### Dots Timeline (not bars/charts)
Dots are compact, scannable, and work at card width. Each dot is a discrete run — this maps cleanly to the 20-run window. Bars would imply continuous data or relative durations, which is not the intent.

### Collapsed Runs by Default
Most of the time, the admin glances at the overview and the collapsed summaries. Expanding is opt-in for investigation. This keeps the page scannable when there are 20 runs visible.

### Newest-to-Oldest Run Order
The most actionable information (latest failure) should be at the top. This matches the natural reading direction and is consistent with log viewers.

### URL-Based Deep Linking
Clicking a dot on the overview links directly to `/health/:jobId?run=:runId`. This means admins can share links to specific failing runs in team chat.
