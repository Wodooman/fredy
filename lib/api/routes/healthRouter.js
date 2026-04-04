/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import * as healthStorage from '../../services/storage/healthStorage.js';

const service = restana();
const healthRouter = service.newRouter();

healthRouter.get('/', (req, res) => {
  res.body = healthStorage.getHealthOverview();
  res.send();
});

healthRouter.get('/:jobId', (req, res) => {
  const result = healthStorage.getJobHealth(req.params.jobId);
  if (!result) {
    res.statusCode = 404;
    res.body = { error: 'Job not found' };
    res.send();
    return;
  }
  res.body = result;
  res.send();
});

healthRouter.get('/:jobId/runs/:runId', (req, res) => {
  const result = healthStorage.getRunDetail(req.params.jobId, req.params.runId);
  if (!result) {
    res.statusCode = 404;
    res.body = { error: 'Run not found' };
    res.send();
    return;
  }
  res.body = result;
  res.send();
});

export { healthRouter };
