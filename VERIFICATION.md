# SeatWise verification

Verified on 28 October 2026.

- Production URL: https://seatwise-gamma.vercel.app
- Production deployment: `dpl_FqRVSPgmGuLLtE5DkmmrMR4NxDQB`
- Production build: passed.
- Hosted database health: connected.
- API execution region: Singapore (`sin1`), verified from Vercel response headers.
- Shared-database integration suite: 13 tests passed against the production API.
- Organiser API: login, event analytics, and inventory reconciliation passed.
- Browser: desktop and 375px mobile layouts checked, with no horizontal page overflow.
- Browser: demo account creation, random wallet, manual seat hold/release, auto-pick, successful wallet payment, and QR ticket creation verified.
- Browser: full VIP class entered its waiting room; switching to available Gold admitted the same account. The QA admission was released afterwards.
- Browser: organiser login, event analytics graph, uploaded QR admission, and rejection of the same QR on repeat verified.
- Latest deployment runtime-error check: no errors returned at verification time.

The automated suite also covers concurrent claims, class isolation, payment retries, failed payments, hold expiry, ownership checks, cancellation refunds, FIFO promotion, reserved capacity, duplicate gate scans, admission expiry, and proxy-origin validation. Its temporary fixture events/accounts are removed after the run.

Payments and wallet balances are explicitly simulated. The live application uses persistent hosted PostgreSQL for reservations, bookings, accounts, sessions, and wallet records.

Local QA screenshots are in the ignored `test-results/` folder. Organiser credentials are in the ignored `DEMO_CREDENTIALS.md`, not in this document or public source.
