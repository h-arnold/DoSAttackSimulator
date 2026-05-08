const OUTCOME_TYPES = Object.freeze(['allowed', 'blocked', 'dropped', 'missed']);

function createZeroOutcomeLedger() {
  return {
    allowed: { count: 0, weighted: 0 },
    blocked: { count: 0, weighted: 0 },
    dropped: { count: 0, weighted: 0 },
    missed: { count: 0, weighted: 0 }
  };
}

function cloneOutcomeLedger(ledger) {
  return {
    allowed: { ...ledger.allowed },
    blocked: { ...ledger.blocked },
    dropped: { ...ledger.dropped },
    missed: { ...ledger.missed }
  };
}

function assertFiniteNumber(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite number.`);
  }
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive integer.`);
  }
}

export default class MetricsCollector {
  constructor({ windowMs = 10000, bucketMs = 1000 } = {}) {
    assertPositiveInteger(windowMs, 'windowMs');
    assertPositiveInteger(bucketMs, 'bucketMs');

    if (bucketMs > windowMs) {
      throw new RangeError('bucketMs must be less than or equal to windowMs.');
    }

    this.windowMs = windowMs;
    this.bucketMs = bucketMs;
    this.reset();
  }

  reset() {
    this.totals = createZeroOutcomeLedger();
    this.buckets = [];
    this.latestTimestampMs = null;
  }

  recordOutcome(outcome, { weight = 1, timestampMs = Date.now() } = {}) {
    if (!OUTCOME_TYPES.includes(outcome)) {
      throw new RangeError(`Unsupported outcome type: ${outcome}`);
    }

    assertFiniteNumber(weight, 'weight');
    assertFiniteNumber(timestampMs, 'timestampMs');

    const bucket = this.getOrCreateBucket(timestampMs);

    this.totals[outcome].count += 1;
    this.totals[outcome].weighted += weight;

    bucket.outcomes[outcome].count += 1;
    bucket.outcomes[outcome].weighted += weight;

    if (this.latestTimestampMs === null || timestampMs > this.latestTimestampMs) {
      this.latestTimestampMs = timestampMs;
    }

    this.pruneBuckets(timestampMs);
  }

  getSnapshot({ timestampMs = this.latestTimestampMs ?? 0 } = {}) {
    assertFiniteNumber(timestampMs, 'timestampMs');

    this.pruneBuckets(timestampMs);

    const rollingTotals = createZeroOutcomeLedger();
    for (const bucket of this.buckets) {
      for (const outcome of OUTCOME_TYPES) {
        rollingTotals[outcome].count += bucket.outcomes[outcome].count;
        rollingTotals[outcome].weighted += bucket.outcomes[outcome].weighted;
      }
    }

    return {
      totals: cloneOutcomeLedger(this.totals),
      rollingWindow: {
        windowMs: this.windowMs,
        totals: cloneOutcomeLedger(rollingTotals),
        buckets: this.buckets.map((bucket) => ({
          startMs: bucket.startMs,
          endMs: bucket.endMs,
          outcomes: cloneOutcomeLedger(bucket.outcomes)
        }))
      }
    };
  }

  getOrCreateBucket(timestampMs) {
    const bucketStart = Math.floor(timestampMs / this.bucketMs) * this.bucketMs;
    const bucketEnd = bucketStart + this.bucketMs;

    const lastBucket = this.buckets[this.buckets.length - 1];
    if (lastBucket && lastBucket.startMs === bucketStart) {
      return lastBucket;
    }

    const existingBucket = this.buckets.find((bucket) => bucket.startMs === bucketStart);
    if (existingBucket) {
      return existingBucket;
    }

    const newBucket = {
      startMs: bucketStart,
      endMs: bucketEnd,
      outcomes: createZeroOutcomeLedger()
    };

    this.buckets.push(newBucket);
    this.buckets.sort((left, right) => left.startMs - right.startMs);

    return newBucket;
  }

  pruneBuckets(anchorTimestampMs) {
    const minStartMs = anchorTimestampMs - this.windowMs;
    this.buckets = this.buckets.filter((bucket) => bucket.startMs >= minStartMs);
  }
}