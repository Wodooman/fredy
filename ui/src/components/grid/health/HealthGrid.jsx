/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Col,
  Row,
  Input,
  Radio,
  RadioGroup,
  Select,
  Button,
  Typography,
  Tag,
  Empty,
  Toast,
  Space,
  Pagination,
} from '@douyinfe/semi-ui-19';
import {
  IconSearch,
  IconArrowUp,
  IconArrowDown,
  IconHome,
  IconPlusCircle,
  IconBriefcase,
  IconAlertCircle,
} from '@douyinfe/semi-icons';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import RunTimeline from './RunTimeline.jsx';
import { useActions, useSelector } from '../../../services/state/store.js';
import './HealthGrid.less';

const PAGE_SIZE = 12;

const STATUS_COLORS = {
  green: 'var(--semi-color-success)',
  yellow: 'var(--semi-color-warning)',
  red: 'var(--semi-color-danger)',
  unknown: 'var(--semi-color-text-3)',
};

const STATUS_ORDER = { red: 0, yellow: 1, green: 2, unknown: 3 };

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

export default function HealthGrid() {
  const navigate = useNavigate();
  const actions = useActions();
  const overview = useSelector((state) => state.healthData.overview) || [];

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('status');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const debounceRef = useRef(null);

  useEffect(() => {
    actions.healthData.getHealthOverview();
  }, []);

  // SSE listener for real-time health updates
  const evtSourceRef = useRef(null);
  useEffect(() => {
    const src = new EventSource('/api/jobs/events');
    evtSourceRef.current = src;

    const onHealthUpdate = (e) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data && data.jobId) {
          // Refresh the full overview to get updated run data
          actions.healthData.getHealthOverview();
          Toast.info({ content: `Job health updated`, duration: 2 });
        }
      } catch {
        // ignore malformed events
      }
    };

    src.addEventListener('healthUpdate', onHealthUpdate);
    src.onerror = () => {};

    return () => {
      src.removeEventListener('healthUpdate', onHealthUpdate);
      src.close();
      evtSourceRef.current = null;
    };
  }, [actions.healthData]);

  const handleSearch = useCallback((val) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchText(val);
      setPage(1);
    }, 500);
  }, []);

  const filtered = useMemo(() => {
    let result = [...overview];

    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter((j) => j.jobName?.toLowerCase().includes(lower));
    }

    if (statusFilter !== 'all') {
      result = result.filter((j) => j.healthStatus === statusFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'status':
          cmp = (STATUS_ORDER[a.healthStatus] ?? 3) - (STATUS_ORDER[b.healthStatus] ?? 3);
          break;
        case 'name':
          cmp = (a.jobName || '').localeCompare(b.jobName || '');
          break;
        case 'lastRun':
          cmp = (b.lastRunAt || 0) - (a.lastRunAt || 0);
          break;
        case 'failures':
          cmp = (b.recentFailures || 0) - (a.recentFailures || 0);
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [overview, searchText, statusFilter, sortField, sortDir]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="health-grid">
      {/* Filter bar */}
      <div className="health-grid__filters">
        <Input
          prefix={<IconSearch />}
          placeholder="Search jobs..."
          showClear
          onChange={handleSearch}
          style={{ width: 220 }}
        />
        <RadioGroup
          type="button"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <Radio value="all">All</Radio>
          <Radio value="green">Healthy</Radio>
          <Radio value="yellow">Degraded</Radio>
          <Radio value="red">Failing</Radio>
        </RadioGroup>
        <Select value={sortField} onChange={(v) => setSortField(v)} style={{ width: 160 }}>
          <Select.Option value="status">Status Severity</Select.Option>
          <Select.Option value="name">Job Name</Select.Option>
          <Select.Option value="lastRun">Last Run</Select.Option>
          <Select.Option value="failures">Failure Count</Select.Option>
        </Select>
        <Button
          icon={sortDir === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        />
      </div>

      {/* Cards grid */}
      {paged.length === 0 ? (
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={<IllustrationNoResultDark style={{ width: 150, height: 150 }} />}
          title="No health data available"
          description="Jobs will appear here after their first run."
          style={{ marginTop: 48 }}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {paged.map((job) => {
            const latestRun = job.runs?.[0];
            return (
              <Col key={job.jobId} xs={24} sm={24} md={12} lg={12} xl={8} xxl={6}>
                <Card
                  className="health-grid__card"
                  bodyStyle={{ padding: 16 }}
                  onClick={() => navigate(`/health/${job.jobId}`)}
                >
                  {/* Header */}
                  <div className="health-grid__card-header">
                    <Space align="center">
                      <span
                        className="health-grid__status-dot"
                        style={{ backgroundColor: STATUS_COLORS[job.healthStatus] }}
                      />
                      <Typography.Text strong ellipsis={{ showTooltip: true }} style={{ maxWidth: 180 }}>
                        {job.jobName || 'Unnamed Job'}
                      </Typography.Text>
                      {!job.enabled && (
                        <Tag size="small" color="grey">
                          Disabled
                        </Tag>
                      )}
                    </Space>
                    <Typography.Text type="tertiary" size="small">
                      {timeAgo(job.lastRunAt)}
                    </Typography.Text>
                  </div>

                  {/* Stats */}
                  <div className="health-grid__stats">
                    <Space>
                      <span className="health-grid__stat health-grid__stat--blue">
                        <IconHome size="small" /> {latestRun?.totalListingsFound ?? '—'}
                      </span>
                      <span className="health-grid__stat health-grid__stat--green">
                        <IconPlusCircle size="small" /> {latestRun?.totalNewListings ?? '—'}
                      </span>
                      <span className="health-grid__stat health-grid__stat--orange">
                        <IconBriefcase size="small" /> {latestRun?.providerCount ?? '—'}
                      </span>
                      <span
                        className={`health-grid__stat ${job.recentFailures > 0 ? 'health-grid__stat--red' : 'health-grid__stat--grey'}`}
                      >
                        <IconAlertCircle size="small" /> {job.recentFailures}/{job.totalRuns}
                      </span>
                    </Space>
                  </div>

                  {/* Timeline */}
                  <div className="health-grid__timeline">
                    <RunTimeline
                      runs={job.runs}
                      onDotClick={(runId) => {
                        navigate(`/health/${job.jobId}?run=${runId}`);
                      }}
                    />
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="health-grid__pagination">
          <Pagination currentPage={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
