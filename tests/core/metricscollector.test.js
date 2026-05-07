import { describe, expect, it } from 'vitest';
import MetricsCollector from '../../js/core/MetricsCollector.js';

function expectZeroOutcomeLedger(ledger) {
  expect(ledger).toEqual({
    allowed: { count: 0, weighted: 0 },
    blocked: { count: 0, weighted: 0 },
    dropped: { count: 0, weighted: 0 },
    missed: { count: 0, weighted: 0 }
  });
}

describe('MetricsCollector', () => {
  it('records each supported outcome into lifetime totals', () => {
    const collector = new MetricsCollector({ windowMs: 10000, bucketMs: 1000 });

    collector.recordOutcome('allowed', { weight: 100, timestampMs: 1000 });
    collector.recordOutcome('blocked', { weight: 200, timestampMs: 1001 });
    collector.recordOutcome('dropped', { weight: 300, timestampMs: 1002 });
    collector.recordOutcome('missed', { weight: 400, timestampMs: 1003 });

    const snapshot = collector.getSnapshot({ timestampMs: 1003 });

    expect(snapshot.totals).toEqual({
      allowed: { count: 1, weighted: 100 },
      blocked: { count: 1, weighted: 200 },
      dropped: { count: 1, weighted: 300 },
      missed: { count: 1, weighted: 400 }
    });
  });

  it('accumulates repeated outcome events deterministically', () => {
    const collector = new MetricsCollector({ windowMs: 10000, bucketMs: 1000 });

    collector.recordOutcome('allowed', { weight: 10, timestampMs: 2000 });
    collector.recordOutcome('allowed', { weight: 25, timestampMs: 2000 });
    collector.recordOutcome('allowed', { weight: 40, timestampMs: 2500 });
    collector.recordOutcome('blocked', { weight: 5, timestampMs: 2600 });

    const snapshot = collector.getSnapshot({ timestampMs: 2600 });

    expect(snapshot.totals).toEqual({
      allowed: { count: 3, weighted: 75 },
      blocked: { count: 1, weighted: 5 },
      dropped: { count: 0, weighted: 0 },
      missed: { count: 0, weighted: 0 }
    });
    expect(snapshot.rollingWindow.totals).toEqual(snapshot.totals);
  });

  it('keeps rolling-window totals within configured time bounds', () => {
    const collector = new MetricsCollector({ windowMs: 2000, bucketMs: 1000 });

    collector.recordOutcome('allowed', { weight: 10, timestampMs: 0 });
    collector.recordOutcome('blocked', { weight: 20, timestampMs: 1000 });
    collector.recordOutcome('dropped', { weight: 30, timestampMs: 2000 });

    const at2000 = collector.getSnapshot({ timestampMs: 2000 });
    expect(at2000.rollingWindow.totals).toEqual({
      allowed: { count: 1, weighted: 10 },
      blocked: { count: 1, weighted: 20 },
      dropped: { count: 1, weighted: 30 },
      missed: { count: 0, weighted: 0 }
    });

    const at3000 = collector.getSnapshot({ timestampMs: 3000 });
    expect(at3000.rollingWindow.totals).toEqual({
      allowed: { count: 0, weighted: 0 },
      blocked: { count: 1, weighted: 20 },
      dropped: { count: 1, weighted: 30 },
      missed: { count: 0, weighted: 0 }
    });
    expect(at3000.rollingWindow.buckets).toEqual([
      expect.objectContaining({ startMs: 1000, endMs: 2000 }),
      expect.objectContaining({ startMs: 2000, endMs: 3000 })
    ]);
  });

  it('resets lifetime and rolling-window state', () => {
    const collector = new MetricsCollector({ windowMs: 5000, bucketMs: 1000 });

    collector.recordOutcome('allowed', { weight: 50, timestampMs: 1000 });
    collector.recordOutcome('dropped', { weight: 25, timestampMs: 2000 });
    collector.reset();

    const snapshot = collector.getSnapshot({ timestampMs: 2000 });

    expect(snapshot.rollingWindow.windowMs).toBe(5000);
    expectZeroOutcomeLedger(snapshot.totals);
    expectZeroOutcomeLedger(snapshot.rollingWindow.totals);
    expect(snapshot.rollingWindow.buckets).toEqual([]);
  });

  it('returns immutable-by-copy snapshot data', () => {
    const collector = new MetricsCollector({ windowMs: 3000, bucketMs: 1000 });
    collector.recordOutcome('allowed', { weight: 100, timestampMs: 1000 });

    const snapshot = collector.getSnapshot({ timestampMs: 1000 });
    snapshot.totals.allowed.count = 999;
    snapshot.rollingWindow.totals.allowed.weighted = 999;
    snapshot.rollingWindow.buckets.push({
      startMs: 999,
      endMs: 1999,
      outcomes: {
        allowed: { count: 1, weighted: 1 },
        blocked: { count: 0, weighted: 0 },
        dropped: { count: 0, weighted: 0 },
        missed: { count: 0, weighted: 0 }
      }
    });

    const fresh = collector.getSnapshot({ timestampMs: 1000 });

    expect(fresh.totals.allowed.count).toBe(1);
    expect(fresh.rollingWindow.totals.allowed.weighted).toBe(100);
    expect(fresh.rollingWindow.buckets).toHaveLength(1);
  });

  it('rejects invalid outcome types explicitly', () => {
    const collector = new MetricsCollector({ windowMs: 3000, bucketMs: 1000 });

    expect(() => collector.recordOutcome('unknown', { weight: 10, timestampMs: 0 })).toThrow(
      'Unsupported outcome type: unknown'
    );
    expect(() => collector.recordOutcome('', { weight: 10, timestampMs: 0 })).toThrow(
      'Unsupported outcome type: '
    );
  });
});