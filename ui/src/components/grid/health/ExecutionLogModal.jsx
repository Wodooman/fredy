/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Modal, Typography, Tag, Space } from '@douyinfe/semi-ui-19';
import { IconChevronRight, IconChevronDown } from '@douyinfe/semi-icons';
import './ExecutionLogModal.less';

const STATUS_COLORS = {
  success: 'green',
  failure: 'red',
  skipped: 'grey',
};

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function StageRow({ stage, index }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = stage.details && Object.keys(stage.details).length > 0;
  const isFailure = stage.status === 'failure';
  const isExpandable = hasDetails || isFailure;

  return (
    <div className={`execution-log__stage ${isFailure ? 'execution-log__stage--failure' : ''}`}>
      <div
        className="execution-log__stage-header"
        onClick={() => isExpandable && setExpanded(!expanded)}
        style={{ cursor: isExpandable ? 'pointer' : 'default' }}
      >
        <Space align="center">
          {isExpandable && (
            <span className="execution-log__chevron">
              {expanded ? <IconChevronDown size="small" /> : <IconChevronRight size="small" />}
            </span>
          )}
          {!isExpandable && <span className="execution-log__chevron-placeholder" />}
          <Typography.Text className="execution-log__stage-number">{index + 1}.</Typography.Text>
          <Typography.Text strong className="execution-log__stage-name">
            {stage.stage.replace(/_/g, ' ')}
          </Typography.Text>
          <Tag size="small" color={STATUS_COLORS[stage.status] || 'grey'}>
            {stage.status}
          </Tag>
        </Space>
        <Typography.Text type="tertiary" size="small">
          {formatDuration(stage.duration_ms)}
        </Typography.Text>
      </div>
      <Typography.Text type="secondary" size="small" className="execution-log__stage-message">
        {stage.message}
      </Typography.Text>
      {expanded && hasDetails && <pre className="execution-log__details">{JSON.stringify(stage.details, null, 2)}</pre>}
    </div>
  );
}

export default function ExecutionLogModal({ visible, onClose, provider, runTimestamp }) {
  if (!provider) return null;

  const log = provider.executionLog || [];
  const totalDuration = log.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

  return (
    <Modal
      title={`Execution Log — ${provider.providerId}`}
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={640}
      bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
    >
      {runTimestamp && (
        <Typography.Text type="tertiary" size="small" style={{ display: 'block', marginBottom: 16 }}>
          {new Date(runTimestamp).toLocaleString()}
        </Typography.Text>
      )}

      <div className="execution-log__stages">
        {log.map((stage, i) => (
          <StageRow key={i} stage={stage} index={i} />
        ))}
      </div>

      <div className="execution-log__total">
        <Typography.Text strong>Total duration: {formatDuration(totalDuration)}</Typography.Text>
      </div>
    </Modal>
  );
}
