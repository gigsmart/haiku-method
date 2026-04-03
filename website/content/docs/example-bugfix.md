---
title: "Example: Bug Fix with Hypothesis Workflow"
description: Using the hypothesis workflow for systematic debugging
order: 12
---

This example demonstrates the **hypothesis workflow** - a scientific approach to debugging complex issues where the root cause isn't obvious.

## The Bug

Users report intermittent 500 errors during checkout. It happens randomly, affects about 2% of checkouts, and has been occurring for two weeks.

## Why Hypothesis Workflow?

This bug is a good candidate for hypothesis workflow because:

- **Intermittent** - Not reproducible on demand
- **Unknown cause** - Stack traces show timeout, but why?
- **Production impact** - Losing revenue, need systematic fix
- **Complex system** - Checkout touches many services

A "shotgun debugging" approach (trying random fixes) would be inefficient and risky.

## Phase 1: Elaboration

```
User: /ai-dlc:elaborate

I want to fix intermittent 500 errors on checkout. About 2% of
checkouts fail with database timeout errors. Been happening for
2 weeks. I want to use the hypothesis workflow.
```

**AI (Elaborator):** "I'll set this up for hypothesis-driven debugging.

```markdown
# .ai-dlc/fix-checkout-500/intent.md

---
status: active
workflow: hypothesis
started_at: 2026-02-02T10:00:00Z
---

# Fix Intermittent Checkout 500 Errors

## Problem Statement
~2% of checkout attempts fail with HTTP 500 errors. Stack traces
indicate database connection timeout. Issue started approximately
2 weeks ago.

## Completion Criteria
- [ ] Root cause identified with evidence
- [ ] Fix implemented and verified
- [ ] Regression test added
- [ ] Error rate returns to baseline (<0.1%)
- [ ] Monitoring added to detect recurrence
- [ ] All tests pass
```

Since this is a single investigation, I'll create one unit for the full debug cycle."

## Phase 2: Execution

### Observer Hat (OHOTL)

**AI (Observer):** "Gathering data about the checkout failures...

**Error Logs Analysis:**

```
Querying logs for checkout 500 errors, last 7 days...

Findings:
- 847 errors out of 42,350 checkouts (2.0%)
- Error: "SequelizeConnectionAcquireTimeoutError"
- Timeout after 10s waiting for connection
- No correlation with specific users
- No correlation with cart size or products
```

**Timing Analysis:**

```
Errors by hour:
  00:00-06:00: 12 errors (0.8%)
  06:00-12:00: 187 errors (1.5%)
  12:00-18:00: 423 errors (2.8%)
  18:00-24:00: 225 errors (2.1%)

Peak error rate correlates with peak traffic.
```

**Recent Changes (last 3 weeks):**

```
- Week -3: No checkout changes
- Week -2: Added inventory check before payment (PR #1234)
- Week -1: Various unrelated changes
```

**Database Metrics:**

```
Current pool configuration:
  - Max connections: 25
  - Idle timeout: 10s
  - Acquire timeout: 10s

Connection pool stats (peak hour):
  - Active: 23-25 (often at max)
  - Waiting: 0-8
  - Idle: 0-2
```

**Summary of Observations:**
1. Errors are connection pool exhaustion (not query failures)
2. Correlates with traffic peaks
3. Started around when inventory check was added
4. Pool frequently at maximum connections
5. No single slow query identified"

### Hypothesizer Hat (HITL)

**AI (Hypothesizer):** "Based on observations, I've formed these hypotheses:

**Hypothesis 1: Connection Pool Too Small (High probability)**
- Evidence: Pool at 25 max, often exhausted
- Theory: Traffic growth outpaced pool size
- Test: Increase pool size, measure error rate

**Hypothesis 2: New Inventory Check Holds Connections (Medium probability)**
- Evidence: Timing aligns with PR #1234
- Theory: Inventory check doesn't release connections properly
- Test: Review code, check for connection leaks

**Hypothesis 3: Slow Query Blocking Pool (Medium probability)**
- Evidence: Timeouts during high traffic
- Theory: Some query blocks connections under load
- Test: Enable slow query logging, analyze during peak

**Hypothesis 4: Database Performance Degraded (Low probability)**
- Evidence: Issue is recent
- Theory: Database server resource constraints
- Test: Check DB server metrics, disk I/O, CPU

**Ranking:**
1. Connection pool too small (simplest, matches data)
2. Inventory check connection leak (timing matches)
3. Slow query (possible contributing factor)
4. Database degradation (least likely, would affect other operations)

Which hypothesis should we test first?"

```
User: Start with #1, but also investigate #2 since it matches the timing.
```

### Experimenter Hat (OHOTL)

**AI (Experimenter):** "Testing hypotheses 1 and 2...

**Experiment 1: Connection Pool Analysis**

```javascript
// Adding pool monitoring
const poolStats = [];
setInterval(() => {
  poolStats.push({
    timestamp: Date.now(),
    active: pool.numUsed(),
    waiting: pool.numPendingAcquires(),
    available: pool.numFree(),
  });
}, 1000);
```

Deployed monitoring to staging, ran load test simulating peak traffic.

**Results:**
```
Load: 100 concurrent checkouts

With pool size 25:
- Average wait time: 4.2s
- Timeouts: 8 requests
- Peak waiting: 12

With pool size 50:
- Average wait time: 0.3s
- Timeouts: 0 requests
- Peak waiting: 2

With pool size 75:
- Average wait time: 0.1s
- Timeouts: 0 requests
- Peak waiting: 0
```

**Conclusion:** Pool size of 25 is insufficient for current load. Increasing to 50 eliminates timeouts in testing.

---

**Experiment 2: Inventory Check Code Review**

```javascript
// PR #1234 - The inventory check
async function checkInventory(cartItems) {
  const connection = await getConnection();  // Acquires from pool
  try {
    for (const item of cartItems) {
      const stock = await connection.query(
        'SELECT quantity FROM inventory WHERE product_id = ?',
        [item.productId]
      );
      if (stock.quantity < item.quantity) {
        throw new InsufficientStockError(item);
      }
    }
  } finally {
    connection.release();  // Properly released
  }
}
```

Code analysis:
- Connection is properly acquired and released
- Uses try/finally pattern correctly
- BUT: Sequential queries for each cart item

**Issue Found:** While not a leak, the sequential queries hold a connection longer than necessary. A cart with 10 items makes 10 sequential queries on one connection.

**Optimized approach:**
```javascript
async function checkInventory(cartItems) {
  const productIds = cartItems.map(i => i.productId);
  const stocks = await db.query(
    'SELECT product_id, quantity FROM inventory WHERE product_id IN (?)',
    [productIds]
  );
  // Single query, connection held briefly
}
```

**Test Results:**
- Original: 340ms connection hold time (10 items)
- Optimized: 45ms connection hold time (10 items)

**Combined Impact:**
Both issues contribute to the problem:
1. Pool too small for traffic
2. Inventory check holds connections 7x longer than needed"

### Analyst Hat (HITL)

**AI (Analyst):** "Analyzing results and proposing fix...

**Root Cause Confirmed:**
Two contributing factors:

1. **Primary:** Connection pool size (25) insufficient for current traffic levels
2. **Secondary:** Inventory check holds connections longer than necessary due to sequential queries

**Evidence:**
- Pool exhaustion directly correlates with errors
- Increasing pool eliminates timeout errors in testing
- Inventory code change timing matches issue start
- Optimizing inventory query reduces connection hold time by 87%

**Proposed Fix:**

```yaml
# Phase 1: Immediate relief
database:
  pool:
    max: 50  # Was 25
    min: 10  # Was 5
    acquireTimeout: 30000  # Was 10000

# Phase 2: Code optimization
# Batch inventory queries (PR attached)
```

**Verification Plan:**
1. Deploy pool increase to staging
2. Run load test confirming no timeouts
3. Deploy to production (canary)
4. Monitor error rate for 24 hours
5. Deploy inventory optimization
6. Monitor for additional improvement

**Monitoring Added:**
```javascript
// Alert if pool utilization > 80% for 5 minutes
alert('db_pool_high_utilization', {
  condition: 'pool_used / pool_max > 0.8',
  duration: '5m',
  severity: 'warning'
});

// Alert if acquire wait time > 5s
alert('db_pool_slow_acquire', {
  condition: 'acquire_wait_p95 > 5000',
  duration: '1m',
  severity: 'critical'
});
```

**Regression Test:**
```javascript
describe('Checkout under load', () => {
  it('completes 100 concurrent checkouts without timeout', async () => {
    const checkouts = Array(100).fill(null).map(() =>
      checkout({ items: [{ productId: 'test', quantity: 1 }] })
    );
    const results = await Promise.allSettled(checkouts);
    const failures = results.filter(r => r.status === 'rejected');
    expect(failures.length).toBe(0);
  });
});
```

Shall I implement this fix?"

```
User: Yes, proceed.
```

**AI:** "Implementing fix...

**Changes made:**
1. Updated database config: pool max 25 -> 50
2. Optimized inventory check: sequential -> batch query
3. Added pool monitoring metrics
4. Added regression test

**Deployment:**
- Deployed to staging
- Load test: 0 timeouts at 150 concurrent users
- Deploying to production (canary 10%)

**Results after 2 hours:**
```
Canary (new config):
- Checkouts: 1,247
- Errors: 0
- Error rate: 0%

Control (old config):
- Checkouts: 11,223
- Errors: 198
- Error rate: 1.8%
```

Fix confirmed effective. Proceeding with full rollout."

## Phase 3: Completion

**AI:** "Fix verified. Updating intent...

```markdown
# .ai-dlc/fix-checkout-500/intent.md

---
status: completed
workflow: hypothesis
started_at: 2026-02-02T10:00:00Z
completed_at: 2026-02-02T14:30:00Z
---

## Completion Criteria
- [x] Root cause identified: Pool exhaustion + inefficient inventory queries
- [x] Fix implemented: Pool size increase + query optimization
- [x] Regression test added: Load test for concurrent checkouts
- [x] Error rate: 0% post-deployment (was 2%)
- [x] Monitoring added: Pool utilization + acquire time alerts
- [x] All tests pass: 156/156
```

**Intent COMPLETE.**

**Summary:**
- Root cause: Connection pool undersized + inefficient queries
- Fix: Increased pool, optimized queries
- Result: Error rate 2% -> 0%
- Prevention: Added monitoring alerts"

## Key Takeaways

### Why Hypothesis Workflow Worked

1. **Systematic approach** - Didn't jump to random fixes
2. **Data-driven** - Observations guided hypotheses
3. **Multiple hypotheses** - Discovered two contributing factors
4. **Verified fix** - Canary deployment confirmed effectiveness

### Time Investment

| Phase | Time | Activities |
|-------|------|------------|
| Observer | 30 min | Log analysis, metrics review, code history |
| Hypothesizer | 15 min | Form and rank theories |
| Experimenter | 60 min | Pool testing, code review, optimization |
| Analyst | 30 min | Confirm cause, implement fix, verify |

Total: ~2.5 hours for a complex production bug.

### What Could Go Wrong

**Without hypothesis workflow:**
- Might have only increased pool size (missing the query optimization)
- Might have tried random fixes (wasting time)
- Might have deployed fix without verification
- Might not have added monitoring (bug could recur)

### Human Decisions Made

1. Prioritized which hypotheses to test
2. Approved the verification plan
3. Approved production deployment

### AI Contributions

1. Gathered and analyzed data systematically
2. Generated multiple hypotheses
3. Designed and executed experiments
4. Proposed comprehensive fix with monitoring

## Next Steps

- **[Workflows](/docs/workflows/)** - Review all workflow options
- **[Example: Feature Implementation](/docs/example-feature/)** - Default workflow example
- **[Core Concepts](/docs/concepts/)** - Understanding the fundamentals
