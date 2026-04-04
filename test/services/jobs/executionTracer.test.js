/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import ExecutionTracer from '../../../lib/services/jobs/executionTracer.js';

describe('services/jobs/executionTracer', () => {
  it('records a successful stage', () => {
    const tracer = new ExecutionTracer();
    const end = tracer.start('extraction');
    end('success', 'Extracted 50 listings', { count: 50 });

    const log = tracer.getLog();
    expect(log).toHaveLength(1);
    expect(log[0].stage).toBe('extraction');
    expect(log[0].status).toBe('success');
    expect(log[0].message).toBe('Extracted 50 listings');
    expect(log[0].details).toEqual({ count: 50 });
    expect(log[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('records a failed stage', () => {
    const tracer = new ExecutionTracer();
    const end = tracer.start('extraction');
    end('failure', 'Timeout after 30s', { error: 'Timeout' });

    const log = tracer.getLog();
    expect(log[0].status).toBe('failure');
    expect(log[0].message).toBe('Timeout after 30s');
  });

  it('records a skipped stage', () => {
    const tracer = new ExecutionTracer();
    const end = tracer.start('area_filter');
    end('skipped', 'No spatial filter configured', null);

    const log = tracer.getLog();
    expect(log[0].status).toBe('skipped');
    expect(log[0].details).toBeNull();
  });

  it('records multiple stages in order', () => {
    const tracer = new ExecutionTracer();

    const end1 = tracer.start('extraction');
    end1('success', 'OK', null);

    const end2 = tracer.start('normalization');
    end2('success', 'OK', null);

    const end3 = tracer.start('filtering');
    end3('success', 'OK', null);

    const log = tracer.getLog();
    expect(log).toHaveLength(3);
    expect(log.map((s) => s.stage)).toEqual(['extraction', 'normalization', 'filtering']);
  });

  it('tracks listings found and new listings', () => {
    const tracer = new ExecutionTracer();

    expect(tracer.getListingsFound()).toBe(0);
    expect(tracer.getNewListings()).toBe(0);

    tracer.setListingsFound(50);
    tracer.setNewListings(3);

    expect(tracer.getListingsFound()).toBe(50);
    expect(tracer.getNewListings()).toBe(3);
  });

  it('record() adds a stage directly', () => {
    const tracer = new ExecutionTracer();
    tracer.record('extraction', 'success', 150, 'Extracted 50', { count: 50 });

    const log = tracer.getLog();
    expect(log).toHaveLength(1);
    expect(log[0].duration_ms).toBe(150);
    expect(log[0].stage).toBe('extraction');
  });

  it('measures duration between start and end', async () => {
    const tracer = new ExecutionTracer();
    const end = tracer.start('slow_stage');
    await new Promise((r) => setTimeout(r, 50));
    end('success', 'Done', null);

    const log = tracer.getLog();
    expect(log[0].duration_ms).toBeGreaterThanOrEqual(40);
  });
});
