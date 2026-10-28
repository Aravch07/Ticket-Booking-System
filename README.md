# SeatWise

**Live website:** [seatwise-gamma.vercel.app](https://seatwise-gamma.vercel.app)

A live concert and show booking platform built with Next.js, React, and hosted PostgreSQL on Neon. The same shared database serves local development and the Vercel deployment; reservations are never stored in browser local storage or instance memory.

## Run locally

Requires Node.js 22 or newer.

```powershell
npm install
```

Copy `.env.example` to `.env.local` and fill in a PostgreSQL connection string, a long random `SESSION_SECRET`, and unique organiser credentials. The already configured workspace has its environment set up. Keep `.env.local` private.

```powershell
npm run db:setup
npm run dev
```

Open `http://localhost:3000`. For a production build, use `npm run build` followed by `npm start`.

## Accounts and demo wallets

- **New user:** Sign up with a name, email, and password. A random ₹9,000–₹18,000 demo balance is credited once.
- **Quick demo:** “Try a fresh demo account” creates a separate account and wallet for the current browser. These guest accounts are meant for the current session; create a normal account to sign in again later.
- **Organiser:** Use the credentials in the local, ignored `DEMO_CREDENTIALS.md`. The file and environment secrets are excluded from Git and Vercel uploads. Open `/admin` after signing in.
- Passwords are salted and scrypt-hashed. Authentication uses opaque, random, server-stored sessions with HttpOnly cookies. Production cookies are Secure.

## What to demonstrate

1. Open Electric Bloom. Choose a class and 1–4 tickets. Enter booking and select seats, or use **Auto-pick & hold**.
2. Open the event on another browser/account. The selected seats are unavailable to that account.
3. Pay with the demo wallet. Choose success, failure, or timeout. Only success deducts funds and creates QR tickets.
4. Open **My tickets**. Download a QR or copy its verification code.
5. Sign in as organiser. Under **Gate check**, upload the QR, scan it with a camera, or paste its code. A second scan is rejected.
6. Try **The Laugh Track**, whose initial sample inventory is fully reserved. New customers enter the waiting room.
7. In another browser, use **Seat control** to release reserved seats in that show/class. The waiting customer is admitted automatically on their next refresh.
8. For class-specific queuing, **Afterhours Club** starts with all VIP seats reserved while Gold and Silver remain open.
9. Reserve seats for guest lists using **Seat control**. The server refuses to consume capacity promised to admitted customers.
10. Create a new event in the control room. It appears on discovery with an entirely available venue. Sales, signups, page visits, occupancy, and check-ins update in the dashboard.

The six initial events, names, lineups, and allocations are fictional demo content. Initial allocations are organiser reservations, not fabricated sales or traffic. Photography is sourced from Unsplash.

## Booking rules

| Rule             | Behaviour                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Class admission  | Capacity is promised for the requested class and quantity before the user can select seats.                                                          |
| Queue policy     | Strict first-in, first-out within each class. A smaller group cannot overtake an earlier group.                                                      |
| Admission window | Two minutes to begin choosing seats. Refreshing never extends it.                                                                                    |
| Seat hold        | Five minutes from the first selection. Changing manual seats never extends it.                                                                       |
| Auto-pick        | Atomically holds random distinct seats within the chosen class. The selection cannot then be changed. Adjacency is not promised.                     |
| Ticket limit     | Four active confirmed tickets per account per event. New requests are checked against existing bookings.                                             |
| Concurrent tabs  | One active queue/admission/hold per account per event, enforced by partial unique indexes.                                                           |
| Checkout         | All requested seats must be selected. Prices and wallet balances are checked on the server.                                                          |
| Payment retries  | A per-account idempotency key returns the stored result. Wallet debit, booking creation, and inventory conversion share a transaction.               |
| Failed payment   | Seats are released, no funds are deducted, and waiting customers can advance.                                                                        |
| Expiry           | Every mutation reclaims expired holds/admissions before proceeding. Availability reads sweep when expiry is due. No cron is needed for correctness.  |
| Cancellation     | Full booking cancellation and refund, until two hours before showtime. Checked-in bookings cannot be cancelled. Retries cannot issue another refund. |
| QR entry         | Server-signed ticket tokens, event matching, cancellation checks, and atomic single-use check-in.                                                    |

The account limit is not proof of real-world identity. QR verification prevents invalid or already-used admissions; it does not eliminate every possible resale scam. No real card payments or cash withdrawals are implemented.

## Concurrency architecture

`lib/schema.sql` is the schema. `lib/service.js` implements the authenticated API. `lib/db.js` centralises the inventory transaction invariant.

All mutations to an event's inventory first take `SELECT ... FOR UPDATE` on that event row in PostgreSQL. Admissions reserve abstract capacity within a class; converting that promise into a physical seat hold happens under the same lock. The lock is enforced by the shared database across independent Vercel instances.

Each `(event_id, seat_id)` has exactly one inventory row. Database constraints enforce valid state and one active user hold/queue entry. Successful payment converts those same held rows to booked rows, debits the wallet, creates tickets, and records a ledger entry within one transaction. No transaction remains open during the user's payment window.

Availability reads use consistent, repeatable-read snapshots without taking the exclusive inventory lock unless an expiry sweep is needed. The browser polls every three seconds with no overlapping polls. The organiser dashboard refreshes every ten seconds. A displayed available seat can change before a click; the atomic hold request is authoritative.

The Node Postgres pool uses Vercel's `attachDatabasePool` lifecycle integration, a five-second idle timeout, verified TLS certificates, bounded connection/query timeouts, and server-side transaction timeouts. Idle connections close before a function is suspended. Read requests can retry once; payment requests retain their idempotency key.

PostgreSQL serialises inventory mutations per event. This is a deliberately simple correctness-first design, not a claim of unlimited traffic capacity. For much larger events, partition locking by class while preserving group-booking and wallet invariants, and load-test at the desired scale.

## Abuse signals and analytics

- An account is flagged for review after 3 expired holds, 8 queue joins, or 3 failed payments in an hour.
- 20 accepted queue joins within ten minutes trigger a temporary booking cooldown.
- Authentication attempts are rate limited using a hashed network fingerprint. Raw IP addresses are not stored.
- Flags describe suspicious patterns; they do not label an account as proven fraudulent.
- Event traffic, bookings, wallet ledger movements, cancellations, and gate scans are recorded from real application actions. Charts show actual records and zeros for hours with no activity.

## Tests

```powershell
npm test
```

To exercise the deployed API while keeping fixture creation and cleanup in this workspace:

```powershell
$env:TEST_BASE_URL='https://seatwise-gamma.vercel.app'
npm test
```

The integration suite uses isolated, explicitly labelled test events/accounts in the configured database and cleans up only those fixtures. Do not run it against an unrelated database. It covers concurrent admissions and seat claims, class isolation, immutable auto-picks, idempotent payment, failure release, expiration, ownership checks, refunds, FIFO queues, organiser capacity protection, and duplicate QR scans.

## Vercel

The workspace is linked to the `seatwise` Vercel project under `uni-321d`. Neon is connected through the Vercel Marketplace on the free plan. Database variables are supplied by that integration. `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are configured as production/preview secrets.

```powershell
npm run build
vercel --prod --scope uni-321d
```

The production health endpoint is `/api/health`. A successful response reports `database: connected`. The API runs in the Singapore region near the database. Application state persists outside Vercel function instances. To separate preview data from production, connect a distinct Neon branch to preview deployments.

Never commit `.env.local`, `.vercel`, or `DEMO_CREDENTIALS.md`. `npm run db:setup` is additive/idempotent and does not reset existing bookings.
