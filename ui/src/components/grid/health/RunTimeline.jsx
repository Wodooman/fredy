/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';
import './RunTimeline.less';

const MAX_DOTS = 20;

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function formatTimestamp(epochMs) {
  return new Date(epochMs).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RunTimeline({ runs = [], size = 'small', onDotClick }) {
  const dotSize = size === 'large' ? 12 : 8;

  // Runs come in desc order (newest first), reverse for left-to-right oldest→newest
  const orderedRuns = [...runs].reverse();

  const placeholderCount = MAX_DOTS - orderedRuns.length;
  const placeholders = Array.from({ length: placeholderCount }, (_, i) => (
    <span
      key={`placeholder-${i}`}
      className="run-timeline__dot run-timeline__dot--empty"
      style={{ width: dotSize, height: dotSize }}
    />
  ));

  const dots = orderedRuns.map((run, i) => {
    const isSuccess = run.status === 'success';
    const className = `run-timeline__dot ${isSuccess ? 'run-timeline__dot--success' : 'run-timeline__dot--failure'}`;
    const duration = run.finishedAt - run.startedAt;
    const runNumber = i + 1;

    const tooltipContent = (
      <div className="run-timeline__tooltip">
        <div>
          Run #{runNumber} — {isSuccess ? 'Success' : 'Failure'}
        </div>
        <div>{formatTimestamp(run.startedAt)}</div>
        <div>Duration: {formatDuration(duration)}</div>
        {run.failedProviderCount > 0 && <div>{run.failedProviderCount} provider(s) failed</div>}
      </div>
    );

    return (
      <Tooltip key={run.runId} content={tooltipContent} position="top">
        <span
          className={className}
          style={{ width: dotSize, height: dotSize, cursor: onDotClick ? 'pointer' : 'default' }}
          onClick={() => onDotClick?.(run.runId)}
        />
      </Tooltip>
    );
  });

  return (
    <div className="run-timeline" style={{ gap: size === 'large' ? 4 : 3 }}>
      {placeholders}
      {dots}
    </div>
  );
}
