/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Card, Typography, Tag, Space, Collapse } from '@douyinfe/semi-ui-19';
import ProviderRunSummary from './ProviderRunSummary.jsx';
import ExecutionLogModal from './ExecutionLogModal.jsx';
import { useActions } from '../../../services/state/store.js';

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatTimestamp(epochMs) {
  return new Date(epochMs).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function RunCard({ run, jobId, defaultExpanded = false }) {
  const actions = useActions();
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [logProvider, setLogProvider] = useState(null);

  const isSuccess = run.status === 'success';
  const duration = run.finishedAt - run.startedAt;
  const providersOk = (run.providers?.length || 0) - (run.providers?.filter((p) => p.status === 'failure').length || 0);
  const totalProviders = run.providers?.length || 0;

  const handleViewLog = async (provider) => {
    // Fetch full run detail to get execution logs
    try {
      const detail = await actions.healthData.getRunDetail(jobId, run.runId);
      const fullProvider = detail?.providers?.find((p) => p.providerId === provider.providerId);
      if (fullProvider) {
        setLogProvider(fullProvider);
        setLogModalVisible(true);
      }
    } catch {
      // If detail already loaded, use what we have
      setLogProvider(provider);
      setLogModalVisible(true);
    }
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <Space align="center">
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: isSuccess ? 'var(--semi-color-success)' : 'var(--semi-color-danger)',
          }}
        />
        <Typography.Text strong>{isSuccess ? 'Success' : 'Failure'}</Typography.Text>
        <Typography.Text type="tertiary" size="small">
          {formatTimestamp(run.startedAt)}
        </Typography.Text>
        <Typography.Text type="tertiary" size="small">
          Duration: {formatDuration(duration)}
        </Typography.Text>
      </Space>
      <Space>
        {run.providers?.map((p) => (
          <Tag key={p.providerId} size="small" color={p.status === 'success' ? 'green' : 'red'}>
            {p.providerId}
          </Tag>
        ))}
      </Space>
    </div>
  );

  const summary = (
    <Typography.Text type="secondary" size="small" style={{ marginLeft: 22 }}>
      {run.totalListingsFound ?? 0} found · {run.totalNewListings ?? 0} new · {providersOk}/{totalProviders} providers
      OK
    </Typography.Text>
  );

  return (
    <>
      <Card bodyStyle={{ padding: 0 }} style={{ marginBottom: 12 }}>
        <Collapse defaultActiveKey={defaultExpanded ? [`run-${run.runId}`] : []}>
          <Collapse.Panel
            header={
              <div>
                {header}
                {summary}
              </div>
            }
            itemKey={`run-${run.runId}`}
          >
            <div style={{ padding: '0 16px 16px' }}>
              {run.providers?.map((provider) => (
                <ProviderRunSummary key={provider.providerId} provider={provider} onViewLog={handleViewLog} />
              ))}
            </div>
          </Collapse.Panel>
        </Collapse>
      </Card>

      <ExecutionLogModal
        visible={logModalVisible}
        onClose={() => setLogModalVisible(false)}
        provider={logProvider}
        runTimestamp={run.startedAt}
      />
    </>
  );
}
