/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';
import HealthKpiRow from '../../components/grid/health/HealthKpiRow.jsx';
import HealthGrid from '../../components/grid/health/HealthGrid.jsx';
import { useSelector } from '../../services/state/store.js';
import './Health.less';

export default function Health() {
  const overview = useSelector((state) => state.healthData.overview) || [];

  return (
    <div className="health-page">
      <Typography.Title heading={3} style={{ marginBottom: 20 }}>
        Health
      </Typography.Title>
      <HealthKpiRow overview={overview} />
      <HealthGrid />
    </div>
  );
}
