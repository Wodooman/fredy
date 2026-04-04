/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ExecutionTracer captures a structured, stage-by-stage execution trace
 * for a single provider run through the pipeline.
 *
 * Usage:
 *   const tracer = new ExecutionTracer();
 *   const end = tracer.start('extraction');
 *   // ... do work ...
 *   end('success', 'Extracted 50 listings', { count: 50 });
 *   // or on failure:
 *   end('failure', 'Timeout after 30s', { error: err.message });
 *
 *   tracer.getLog();        // → array of stage entries
 *   tracer.getListingsFound();
 *   tracer.getNewListings();
 */
class ExecutionTracer {
  constructor() {
    this._stages = [];
    this._listingsFound = 0;
    this._newListings = 0;
  }

  /**
   * Begin timing a pipeline stage. Returns a function to call when the stage completes.
   *
   * @param {string} stage - Stage name (e.g., 'extraction', 'filtering')
   * @returns {(status: 'success'|'skipped'|'failure', message: string, details?: object) => void}
   */
  start(stage) {
    const t0 = Date.now();
    return (status, message, details = null) => {
      this._stages.push({
        stage,
        status,
        duration_ms: Date.now() - t0,
        message,
        details,
      });
    };
  }

  /**
   * Record a stage that completed synchronously (convenience for already-timed stages).
   */
  record(stage, status, durationMs, message, details = null) {
    this._stages.push({
      stage,
      status,
      duration_ms: durationMs,
      message,
      details,
    });
  }

  /** Set the total listings found count (from extraction stage). */
  setListingsFound(count) {
    this._listingsFound = count;
  }

  /** Set the new listings count (from deduplication stage). */
  setNewListings(count) {
    this._newListings = count;
  }

  /** @returns {number} */
  getListingsFound() {
    return this._listingsFound;
  }

  /** @returns {number} */
  getNewListings() {
    return this._newListings;
  }

  /** @returns {Array<Object>} The structured execution log. */
  getLog() {
    return this._stages;
  }
}

export default ExecutionTracer;
