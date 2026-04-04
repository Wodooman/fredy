/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Row, Col } from '@douyinfe/semi-ui-19';
import { IconTerminal, IconCheckCircleStroked, IconAlertTriangle, IconAlertCircle } from '@douyinfe/semi-icons';
import KpiCard from '../../cards/KpiCard.jsx';

export default function HealthKpiRow({ overview = [] }) {
  const jobsWithRuns = overview.filter((j) => j.totalRuns > 0);
  const healthy = overview.filter((j) => j.healthStatus === 'green').length;
  const degraded = overview.filter((j) => j.healthStatus === 'yellow').length;
  const failing = overview.filter((j) => j.healthStatus === 'red').length;
  const neverRun = overview.filter((j) => j.healthStatus === 'unknown').length;

  const totalDesc = neverRun > 0 ? `${neverRun} never run` : 'All jobs have run data';

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={24} sm={12} md={12} lg={6} xl={6}>
        <KpiCard
          title="Total Jobs"
          icon={<IconTerminal size="large" />}
          value={jobsWithRuns.length}
          color="blue"
          description={totalDesc}
        />
      </Col>
      <Col xs={24} sm={12} md={12} lg={6} xl={6}>
        <KpiCard
          title="Healthy"
          icon={<IconCheckCircleStroked size="large" />}
          value={healthy}
          color="green"
          description="No failures in window"
        />
      </Col>
      <Col xs={24} sm={12} md={12} lg={6} xl={6}>
        <KpiCard
          title="Degraded"
          icon={<IconAlertTriangle size="large" />}
          value={degraded}
          color="orange"
          description="Past failures, now OK"
        />
      </Col>
      <Col xs={24} sm={12} md={12} lg={6} xl={6}>
        <KpiCard
          title="Failing"
          icon={<IconAlertCircle size="large" />}
          value={failing}
          color="purple"
          description="Last run failed"
        />
      </Col>
    </Row>
  );
}
