/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography, Tag, Banner, Button, Space } from '@douyinfe/semi-ui-19';
import { IconEyeOpened } from '@douyinfe/semi-icons';

export default function ProviderRunSummary({ provider, onViewLog }) {
  const isSuccess = provider.status === 'success';

  return (
    <div style={{ marginBottom: 12, padding: 12, border: '1px solid var(--semi-color-border)', borderRadius: 8 }}>
      <Space align="center" style={{ marginBottom: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isSuccess ? 'var(--semi-color-success)' : 'var(--semi-color-danger)',
          }}
        />
        <Typography.Text strong>{provider.providerId}</Typography.Text>
        <Tag size="small" color={isSuccess ? 'green' : 'red'}>
          {isSuccess ? 'Success' : 'Failure'}
        </Tag>
      </Space>

      {!isSuccess && provider.errorMessage && (
        <Banner type="danger" description={provider.errorMessage} style={{ marginBottom: 8 }} />
      )}

      <div style={{ marginBottom: 8 }}>
        <Typography.Text type="secondary" size="small">
          Listings found: {provider.listingsFound} · New: {provider.newListings}
        </Typography.Text>
      </div>

      {onViewLog && (
        <Button size="small" icon={<IconEyeOpened />} onClick={() => onViewLog(provider)}>
          View Log
        </Button>
      )}
    </div>
  );
}
