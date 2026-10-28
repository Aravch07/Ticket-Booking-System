import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { database } from "../lib/db.js";
import { hashPassword, digest, qrToken } from "../lib/auth.js";
import { dispatch } from "../lib/service.js";

const sql = database();
const eventIds = [],
  userIds = [];
const seedHash = hashPassword("TestOnly-password-2026");
async function fixture(name, capacity = 4) {
  const id = `test-${name}-${randomUUID().slice(0, 8)}`;
  eventIds.push(id);
  const details = {
    date: "2027-12-31T18:00:00+05:30",
    venue: "Test venue",
    image: "/images/bloom.jpg",
    category: "Live music",
    basePrice: 1000,
    city: "Bengaluru",
    isTest: true,
  };
  await sql`INSERT INTO events(id,title,details) VALUES(${id},${"Integration test: " + name},${sql.json(details)})`;
  for (const c of ["silver", "vip"]) {
    await sql`INSERT INTO classes(event_id,id,name,price,details) VALUES(${id},${c},${c},${c === "vip" ? 2500 : 1000},${sql.json({ label: c.toUpperCase() })})`;
    for (let i = 1; i <= (c === "vip" ? 2 : capacity); i++)
      await sql`INSERT INTO seats(event_id,id,class_id,row_label,number,x,y,rotation) VALUES(${id},${c[0].toUpperCase() + i},${c},'A',${i},0,0,0)`;
  }
  return id;
}
async function users(n, role = "user") {
  const list = Array.from({ length: n }, () => {
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    userIds.push(id);
    return { id, token, cookie: "sw_session=" + token };
  });
  await sql`INSERT INTO users ${sql(list.map((u) => ({ id: u.id, name: "Integration test fan", email: `test-${u.id}@seatwise.invalid`, password_hash: seedHash, role, wallet: 50000 })))}`;
  await sql`INSERT INTO sessions ${sql(list.map((u) => ({ digest: digest(u.token), user_id: u.id, expires_at: new Date(Date.now() + 3600000) })))}`;
  return list;
}
async function req(path, user, body) {
  const request = new Request(
    (process.env.TEST_BASE_URL || "http://seatwise.test") + "/api" + path,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(user ? { cookie: user.cookie } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const r = process.env.TEST_BASE_URL
    ? await fetch(request)
    : await dispatch(request);
  return { status: r.status, data: await r.json() };
}
async function balance(u) {
  return (await sql`SELECT wallet FROM users WHERE id=${u.id}`)[0].wallet;
}

test("SeatWise shared-database booking invariants", async (t) => {
  try {
    const event = await fixture("concurrency");
    const fans = await users(24),
      [admin] = await users(1, "admin");
    let admitted = [],
      winner,
      autoFan,
      autoHold,
      paidBooking,
      paidToken;

    await t.test(
      "24 simultaneous joins admit only four fans to a four-seat class",
      async () => {
        const r = await Promise.all(
          fans.map((u) =>
            req(`/events/${event}/join`, u, { classId: "silver", quantity: 1 }),
          ),
        );
        assert.ok(
          r.every((x) => x.status === 200),
          JSON.stringify(r.filter((x) => x.status !== 200)),
        );
        admitted = fans.filter((_, i) => r[i].data.queue.state === "admitted");
        assert.equal(admitted.length, 4);
        assert.equal(
          r.filter((x) => x.data.queue.state === "waiting").length,
          20,
        );
        const [pending] =
          await sql`SELECT COALESCE(sum(quantity),0)::int AS quantity FROM queue_entries WHERE event_id=${event} AND class_id='silver' AND state='admitted'`;
        assert.equal(pending.quantity, 4);
      },
    );

    await t.test(
      "waiting users cannot bypass admission or select another class",
      async () => {
        const waiting = fans.find((u) => !admitted.includes(u));
        assert.equal(
          (await req(`/events/${event}/hold`, waiting, { seatId: "S1" }))
            .status,
          409,
        );
        const wrong = await req(`/events/${event}/hold`, admitted[0], {
          seatId: "V1",
        });
        assert.equal(wrong.status, 409);
        assert.equal(wrong.data.code, "WRONG_CLASS");
        const other = await req(`/events/${event}/join`, waiting, {
          classId: "vip",
          quantity: 1,
        });
        assert.equal(other.data.queue.state, "admitted");
        assert.equal(other.data.queue.classId, "vip");
        assert.equal(
          (await req(`/events/${event}/hold`, waiting, { seatId: "S1" })).data
            .code,
          "WRONG_CLASS",
        );
      },
    );

    await t.test(
      "four concurrent claims for the same seat have exactly one winner",
      async () => {
        const r = await Promise.all(
          admitted.map((u) =>
            req(`/events/${event}/hold`, u, { seatId: "S1" }),
          ),
        );
        assert.equal(r.filter((x) => x.status === 200).length, 1);
        assert.equal(
          r.filter((x) => x.data.code === "SEAT_CONFLICT").length,
          3,
        );
        winner = admitted[r.findIndex((x) => x.status === 200)];
        const [held] =
          await sql`SELECT count(*)::int AS count FROM seats WHERE event_id=${event} AND id='S1' AND status='held'`;
        assert.equal(held.count, 1);
      },
    );

    await t.test(
      "auto-pick claims distinct random seats and prevents subsequent changes",
      async () => {
        const others = admitted.filter((u) => u !== winner);
        const r = await Promise.all(
          others.map((u) => req(`/events/${event}/hold`, u, { mode: "auto" })),
        );
        assert.ok(
          r.every((x) => x.status === 200),
          JSON.stringify(r),
        );
        assert.equal(new Set(r.map((x) => x.data.hold.seats[0].id)).size, 3);
        autoFan = others[0];
        autoHold = r[0].data.hold;
        const changed = await req(`/events/${event}/hold`, autoFan, {
          seatId: autoHold.seats[0].id,
        });
        assert.equal(changed.data.code, "AUTO_LOCKED");
        assert.equal(
          (await req(`/events/${event}/hold`, autoFan, { mode: "auto" })).data
            .code,
          "AUTO_LOCKED",
        );
      },
    );

    await t.test(
      "eight concurrent payment retries create one booking and one debit",
      async () => {
        const hold = (await req(`/events/${event}`, winner)).data.hold;
        const key = randomUUID(),
          before = await balance(winner);
        const result = await Promise.all(
          Array.from({ length: 8 }, () =>
            req(`/events/${event}/pay`, winner, {
              holdId: hold.id,
              key,
              outcome: "success",
              total: 1,
              price: 1,
            }),
          ),
        );
        assert.ok(
          result.every((r) => r.status === 200 && r.data.ok),
          JSON.stringify(result),
        );
        assert.equal(new Set(result.map((r) => r.data.bookingId)).size, 1);
        paidBooking = result[0].data.bookingId;
        assert.equal(await balance(winner), before - 1000);
        const [count] =
          await sql`SELECT count(*)::int AS count FROM wallet_ledger WHERE user_id=${winner.id} AND kind='Tickets purchased'`;
        assert.equal(count.count, 1);
        const ticket = (await req("/bookings", winner)).data.bookings[0]
          .tickets[0];
        paidToken = ticket.token;
      },
    );

    await t.test(
      "failed mock payments release seats, preserve wallet, and advance waiting fans",
      async () => {
        const before = await balance(autoFan),
          key = randomUUID();
        const r = await req(`/events/${event}/pay`, autoFan, {
          holdId: autoHold.id,
          key,
          outcome: "failure",
        });
        assert.equal(r.status, 200);
        assert.equal(r.data.ok, false);
        assert.equal(await balance(autoFan), before);
        const [oldHold] =
          await sql`SELECT state FROM holds WHERE id=${autoHold.id}`;
        assert.equal(oldHold.state, "failed");
        const [promoted] =
          await sql`SELECT count(*)::int AS count FROM queue_entries WHERE event_id=${event} AND class_id='silver' AND state='admitted'`;
        assert.equal(promoted.count, 1);
        const retry = await req(`/events/${event}/pay`, autoFan, {
          holdId: autoHold.id,
          key,
          outcome: "success",
        });
        assert.equal(retry.data.ok, false);
        assert.equal(await balance(autoFan), before);
      },
    );

    await t.test(
      "expired holds are reclaimed on the next request and late payments cannot debit",
      async () => {
        const [h] =
          await sql`SELECT id,user_id FROM holds WHERE event_id=${event} AND state='active' LIMIT 1`;
        const owner = fans.find((u) => u.id === h.user_id),
          before = await balance(owner);
        await sql.begin(async (tx) => {
          await tx`SELECT id FROM events WHERE id=${event} FOR UPDATE`;
          await tx`UPDATE holds SET expires_at=now()-interval '1 second' WHERE id=${h.id}`;
        });
        await req(`/events/${event}`, owner);
        const [old] = await sql`SELECT state FROM holds WHERE id=${h.id}`;
        assert.equal(old.state, "expired");
        const late = await req(`/events/${event}/pay`, owner, {
          holdId: h.id,
          key: randomUUID(),
          outcome: "success",
        });
        assert.equal(late.data.code, "HOLD_EXPIRED");
        assert.equal(await balance(owner), before);
        const stuck =
          await sql`SELECT id FROM seats WHERE hold_id=${h.id} AND status='held'`;
        assert.equal(stuck.length, 0);
      },
    );

    await t.test(
      "unauthorised users cannot cancel another booking or access organiser data",
      async () => {
        assert.equal(
          (await req(`/bookings/${paidBooking}/cancel`, autoFan, {})).status,
          404,
        );
        assert.equal((await req("/admin/stats", autoFan)).status, 403);
        assert.equal(
          (
            await req("/admin/inventory", null, {
              eventId: event,
              classId: "silver",
              quantity: 1,
              action: "reserve",
            })
          ).status,
          401,
        );
      },
    );

    await t.test(
      "concurrent cancellation retries refund exactly once and invalidate the ticket",
      async () => {
        const before = await balance(winner);
        const r = await Promise.all(
          Array.from({ length: 5 }, () =>
            req(`/bookings/${paidBooking}/cancel`, winner, {}),
          ),
        );
        assert.ok(
          r.every((x) => x.status === 200),
          JSON.stringify(r),
        );
        assert.equal(await balance(winner), before + 1000);
        const [count] =
          await sql`SELECT count(*)::int AS count FROM wallet_ledger WHERE reference=${"refund:" + paidBooking}`;
        assert.equal(count.count, 1);
        const scan = await req("/admin/scan", admin, {
          token: paidToken,
          eventId: event,
        });
        assert.equal(scan.data.code, "REVOKED_TICKET");
      },
    );

    await t.test(
      "class queues stay FIFO; organiser allocations never consume promised admission",
      async () => {
        const second = await fixture("fifo", 4),
          [a, b] = await users(2);
        const r = await req("/admin/inventory", admin, {
          eventId: second,
          classId: "silver",
          quantity: 2,
          action: "reserve",
          reason: "Test guest list",
        });
        assert.equal(r.status, 200);
        assert.equal(
          (
            await req(`/events/${second}/join`, a, {
              classId: "silver",
              quantity: 4,
            })
          ).data.queue.state,
          "waiting",
        );
        assert.equal(
          (
            await req(`/events/${second}/join`, b, {
              classId: "silver",
              quantity: 1,
            })
          ).data.queue.state,
          "waiting",
        );
        await req("/admin/inventory", admin, {
          eventId: second,
          classId: "silver",
          quantity: 2,
          action: "release",
        });
        assert.equal(
          (await req(`/events/${second}`, a)).data.queue.state,
          "admitted",
        );
        assert.equal(
          (await req(`/events/${second}`, b)).data.queue.state,
          "waiting",
        );
        const reserve = await req("/admin/inventory", admin, {
          eventId: second,
          classId: "silver",
          quantity: 1,
          action: "reserve",
        });
        assert.equal(reserve.data.code, "CAPACITY_PROMISED");
        const picked = await req(`/events/${second}/hold`, a, { mode: "auto" });
        assert.equal(picked.data.hold.seats.length, 4);
        const payment = await req(`/events/${second}/pay`, a, {
          holdId: picked.data.hold.id,
          key: randomUUID(),
          outcome: "success",
        });
        assert.equal(payment.data.ok, true);
        const booking = (await req("/bookings", a)).data.bookings.find(
          (x) => x.id === payment.data.bookingId,
        );
        const token = booking.tickets[0].token;
        const wrong = await req("/admin/scan", admin, {
          token,
          eventId: event,
        });
        assert.equal(wrong.data.code, "WRONG_EVENT");
        const scans = await Promise.all([
          req("/admin/scan", admin, { token, eventId: second }),
          req("/admin/scan", admin, { token, eventId: second }),
        ]);
        assert.equal(scans.filter((r) => r.status === 200).length, 1);
        assert.equal(
          scans.filter((r) => r.data.code === "ALREADY_USED").length,
          1,
        );
        assert.equal(
          (await req(`/bookings/${booking.id}/cancel`, a, {})).data.code,
          "ALREADY_CHECKED_IN",
        );
      },
    );

    await t.test(
      "admission expiry releases unused capacity without a cron worker",
      async () => {
        const third = await fixture("admission-expiry", 1),
          [a, b] = await users(2);
        const joined = await req(`/events/${third}/join`, a, {
          classId: "silver",
          quantity: 1,
        });
        assert.equal(joined.data.queue.state, "admitted");
        assert.equal(
          (
            await req(`/events/${third}/join`, b, {
              classId: "silver",
              quantity: 1,
            })
          ).data.queue.state,
          "waiting",
        );
        await sql.begin(async (tx) => {
          await tx`SELECT id FROM events WHERE id=${third} FOR UPDATE`;
          await tx`UPDATE queue_entries SET expires_at=now()-interval '1 second' WHERE id=${joined.data.queue.id}`;
        });
        assert.equal(
          (await req(`/events/${third}`, b)).data.queue.state,
          "admitted",
        );
        assert.equal(
          (await req(`/events/${third}/hold`, a, { seatId: "S1" })).data.code,
          "ADMISSION_REQUIRED",
        );
      },
    );
    await t.test(
      "origin checks accept the public proxy host and reject cross-site requests",
      async () => {
        const request = (origin) =>
          new Request(`http://0.0.0.0:3000/api/events/${event}/leave`, {
            method: "POST",
            headers: {
              host: "localhost:3000",
              origin,
              cookie: winner.cookie,
              "content-type": "application/json",
            },
            body: "{}",
          });
        const bad = await dispatch(request("https://unrelated.example"));
        assert.equal(bad.status, 403);
        const good = await dispatch(request("http://localhost:3000"));
        assert.equal(good.status, 200);
      },
    );
  } finally {
    // Only remove fixtures created by this test run. Never reset the real catalogue.
    await sql.begin(async (tx) => {
      if (eventIds.length) {
        await tx`DELETE FROM activity WHERE event_id IN ${tx(eventIds)}`;
        await tx`DELETE FROM payments WHERE hold_id IN (SELECT id FROM holds WHERE event_id IN ${tx(eventIds)})`;
        await tx`DELETE FROM tickets WHERE event_id IN ${tx(eventIds)}`;
        await tx`DELETE FROM queue_entries WHERE event_id IN ${tx(eventIds)}`;
        await tx`DELETE FROM seats WHERE event_id IN ${tx(eventIds)}`;
        await tx`DELETE FROM bookings WHERE event_id IN ${tx(eventIds)}`;
        await tx`DELETE FROM holds WHERE event_id IN ${tx(eventIds)}`;
        await tx`DELETE FROM classes WHERE event_id IN ${tx(eventIds)}`;
        await tx`DELETE FROM events WHERE id IN ${tx(eventIds)}`;
      }
      if (userIds.length) {
        await tx`DELETE FROM activity WHERE user_id IN ${tx(userIds)}`;
        await tx`DELETE FROM wallet_ledger WHERE user_id IN ${tx(userIds)}`;
        await tx`DELETE FROM users WHERE id IN ${tx(userIds)}`;
      }
    });
    await sql.end();
  }
});
