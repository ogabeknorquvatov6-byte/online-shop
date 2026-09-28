# Real concurrency test — two independent PostgreSQL sessions

## Why this exists

`supabase/tests/order_integrity_test.sql` runs in a **single** session. A single
session never waits for its own lock, so that suite cannot prove the `FOR UPDATE`
locking in `create_order_as` actually prevents overselling. This script closes
that gap with two genuinely separate `psql` processes.

## What it proves

| # | Assertion |
|---|---|
| 1 | Session B **actually blocks** on session A's row lock (confirmed via `pg_stat_activity`, not assumed) |
| 2 | After A commits, B **re-reads** the row and fails with `OUT_OF_STOCK` |
| 3 | Final stock is exactly `0` |
| 4 | Stock never goes negative |
| 5 | Exactly **one** order exists for the test product |
| 6 | Total sold quantity is exactly `1` — no overselling |
| 7 | Same `checkout_request_id` concurrently → exactly one order, stock decremented once |

## It is deterministic, not timing-based

A naive "fire both at once" test passes vacuously whenever the two calls happen
not to overlap. Instead:

1. A opens a transaction and explicitly takes `SELECT … FOR UPDATE` on the product row.
2. B calls `create_order_as` and **blocks** on that lock.
3. The script **verifies B is genuinely waiting** by polling `pg_stat_activity`
   for `wait_event_type = 'Lock'`. If B is not blocked, the test **fails** —
   the race cannot silently not happen.
4. A completes its order and commits.
5. B unblocks, re-reads stock under its own lock, and must raise `OUT_OF_STOCK`.

There is no `sleep()` used to create the race — only condition polling to observe it.

## Requirements

- `psql` on `PATH`
- **Session mode, port 5432.** Transaction mode (6543) will break this test:
  it does not hold session state across statements.
- `PG*` environment variables set in your own shell (see below)

## Running

```powershell
$sec = Read-Host "OpenShop-Test DB password" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))

$env:PGHOST     = "aws-0-ap-southeast-2.pooler.supabase.com"
$env:PGPORT     = "5432"
$env:PGDATABASE = "postgres"
$env:PGUSER     = "postgres.scekcknujaueoslgcntx"
$env:PGSSLMODE  = "require"

npm run test:concurrency

Remove-Item Env:PGPASSWORD
```

## Safety

- **Hard guard:** the script exits with code `2` unless `PGUSER`/`PGHOST`
  contains `scekcknujaueoslgcntx`. It cannot run against production.
- Test data uses fixed, recognisable UUIDs (`…c0a1` category, `…c0b1` product,
  `…c0c1` customer, `…c0d1`–`…c0d3` idempotency keys) and a dedicated product
  with SKU `SKU-CONCURRENCY`.

  All characters in these literals are **hexadecimal** (`0-9`, `a-f`). An
  earlier version used `…c0u1` / `…c0k1` as mnemonics for "user" and "key" —
  but `u` and `k` are not hex, so Postgres rejected every statement with
  `invalid input syntax for type uuid`. The sessions never reached
  `create_order_as`, B never waited on the lock, and the suite reported
  results without having tested concurrency at all.
- Cleanup runs **before and after**, so the script is safe to re-run.
- Unlike the SQL suite, this test **commits** (it must — a rollback would
  destroy the very cross-session visibility being tested). All rows it creates
  are deleted at the end.

The test `auth.users` row (`…c0u1`, `concurrency-test@example.invalid`) is
deliberately **left in place**: it is inert, makes re-runs faster, and deleting
auth users can cascade in ways that aren't worth risking in a shared project.

## Known behaviour this test documents (not a bug it fixes)

When two **genuinely concurrent** requests share one `checkout_request_id` and
stock is exactly 1, the losing request receives `OUT_OF_STOCK` from the stock
validation in phase 1 — it never reaches the unique-violation idempotency
handler in phase 4. The user sees an error even though their order exists
(created by the winning request).

This is a **UX/correctness wart, not a security or integrity defect**:

- no duplicate order is created
- stock is never decremented twice
- no overselling occurs

Fixing it would mean re-checking the idempotency key *after* acquiring the row
lock — a schema/function change, i.e. a migration. That is intentionally **not**
done here. The test asserts and documents the current behaviour instead.
