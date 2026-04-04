/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Card, Typography, Tag, Space, Spin } from '@douyinfe/semi-ui-19';
import { IconArrowLeft } from '@douyinfe/semi-icons';
import RunTimeline from '../../components/grid/health/RunTimeline.jsx';
import RunCard from '../../components/grid/health/RunCard.jsx';
import { useActions, useSelector } from '../../services/state/store.js';
import './JobHealthDetail.less';

const STATUS_LABELS = {
  green: 'Healthy',
  yellow: 'Degraded',
  red: 'Failing',
  unknown: 'Unknown',
};

const STATUS_TAG_COLORS = {
  green: 'green',
  yellow: 'orange',
  red: 'red',
  unknown: 'grey',
};

function timeAgo(epochMs) {
  if (!epochMs) return 'Never';
  const diff = Date.now() - epochMs;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function JobHealthDetail() {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const actions = useActions();
  const jobDetail = useSelector((state) => state.healthData.jobDetail);
  const scrollRef = useRef(null);

  const highlightedRunId = searchParams.get('run');

  useEffect(() => {
    if (jobId) {
      actions.healthData.getJobHealth(jobId);
    }
  }, [jobId]);

  // SSE listener
  const evtSourceRef = useRef(null);
  useEffect(() => {
    const src = new EventSource('/api/jobs/events');
    evtSourceRef.current = src;

    const onHealthUpdate = (e) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data?.jobId === jobId) {
          actions.healthData.getJobHealth(jobId);
        }
      } catch {
        // ignore
      }
    };

    src.addEventListener('healthUpdate', onHealthUpdate);
    return () => {
      src.removeEventListener('healthUpdate', onHealthUpdate);
      src.close();
    };
  }, [jobId, actions.healthData]);

  // Scroll to highlighted run
  useEffect(() => {
    if (highlightedRunId && scrollRef.current) {
      const el = document.getElementById(`run-${highlightedRunId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedRunId, jobDetail]);

  if (!jobDetail || jobDetail.jobId !== jobId) {
    return (
      <div className="job-health-detail" style={{ textAlign: 'center', paddingTop: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const lastRunAt = jobDetail.runs?.[0]?.startedAt;
  const providerCount = jobDetail.runs?.[0]?.providers?.length || 0;

  return (
    <div className="job-health-detail">
      <Button
        icon={<IconArrowLeft />}
        theme="borderless"
        onClick={() => navigate('/health')}
        style={{ marginBottom: 16 }}
      >
        Back to Health
      </Button>

      {/* Header card */}
      <Card bodyStyle={{ padding: 20 }} style={{ marginBottom: 24 }}>
        <div className="job-health-detail__header">
          <Space align="center">
            <span
              className="job-health-detail__status-dot"
              style={{
                backgroundColor:
                  jobDetail.healthStatus === 'green'
                    ? 'var(--semi-color-success)'
                    : jobDetail.healthStatus === 'yellow'
                      ? 'var(--semi-color-warning)'
                      : jobDetail.healthStatus === 'red'
                        ? 'var(--semi-color-danger)'
                        : 'var(--semi-color-text-3)',
              }}
            />
            <Typography.Title heading={4} style={{ margin: 0 }}>
              {jobDetail.jobName || 'Unnamed Job'}
            </Typography.Title>
            <Tag size="large" color={STATUS_TAG_COLORS[jobDetail.healthStatus]}>
              {STATUS_LABELS[jobDetail.healthStatus]}
            </Tag>
          </Space>
        </div>

        <Typography.Text type="tertiary" style={{ display: 'block', marginBottom: 12 }}>
          {jobDetail.enabled ? 'Enabled' : 'Disabled'} · {providerCount} providers · Last run {timeAgo(lastRunAt)}
        </Typography.Text>

        <RunTimeline
          runs={jobDetail.runs?.map((r) => ({
            ...r,
            failedProviderCount: r.providers?.filter((p) => p.status === 'failure').length || 0,
            providerCount: r.providers?.length || 0,
          }))}
          size="large"
          onDotClick={(runId) => navigate(`/health/${jobId}?run=${runId}`, { replace: true })}
        />
      </Card>

      {/* Run list */}
      <Typography.Title heading={5} style={{ marginBottom: 16 }}>
        Run History ({jobDetail.runs?.length || 0})
      </Typography.Title>

      <div ref={scrollRef}>
        {jobDetail.runs?.map((run) => (
          <div key={run.runId} id={`run-${run.runId}`}>
            <RunCard run={run} jobId={jobId} defaultExpanded={run.runId === highlightedRunId} />
          </div>
        ))}
      </div>

      {(!jobDetail.runs || jobDetail.runs.length === 0) && (
        <Typography.Text type="tertiary">No runs recorded yet.</Typography.Text>
      )}
    </div>
  );
}
