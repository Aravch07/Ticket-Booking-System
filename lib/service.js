import { randomUUID, randomInt } from "node:crypto";
import {
  database,
  fail,
  AppError,
  withEvent,
  snapshot,
  promote,
  spareCapacity,
  activity,
  maintain,
} from "./db.js";
import {
  hashPassword,
  checkPassword,
  publicUser,
  currentUser,
  createSession,
  sessionCookie,
  digest,
  secret,
  needUser,
  needAdmin,
  qrToken,
  verifyToken,
} from "./auth.js";
import { ticketClasses, seatLayout } from "./catalog.js";
import { resolveBanner } from './banners.js';
import { launchSnapshot } from './launch.js';

const activeQueue = ["waiting", "admitted", "holding"];
function integer(value, min, max, label = "Quantity") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    fail(`${label} must be between ${min} and ${max}.`);
  return n;
}
function emailValue(value) {
  const e = String(value || "")
    .trim()
    .toLowerCase();
  if (e.length > 200 || !/^\S+@\S+\.\S+$/.test(e))
    fail("Enter a valid email address.");
  return e;
}
const reply = (value, status = 200, cookie = null) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });

async function authRate(request) {
  const sql = database();
  const fp = digest(
    `${request.headers.get("x-forwarded-for")?.split(",")[0] || "local"}:${secret()}`,
  );
  await sql`INSERT INTO auth_attempts(fingerprint) VALUES(${fp})`;
  const [r] =
    await sql`SELECT count(*)::int AS count FROM auth_attempts WHERE fingerprint=${fp} AND created_at>now()-interval '15 minutes'`;
  if (r.count > 70)
    fail(
      "Too many sign-in attempts. Please try again in 15 minutes.",
      429,
      "RATE_LIMIT",
    );
}

async function signIn(request, body, kind) {
  await authRate(request);
  const sql = database();
  let user;
  if (kind === "login") {
    const email = emailValue(body.email);
    [user] = await sql`SELECT * FROM users WHERE email=${email}`;
    if (
      !user ||
      !checkPassword(String(body.password || ""), user.password_hash)
    )
      fail("The email or password is incorrect.", 401, "BAD_CREDENTIALS");
  } else {
    const demo = kind === "demo";
    const id = randomUUID();
    const name = demo
      ? ["Maya", "Arjun", "Zoya", "Kabir", "Isha", "Rohan"][randomInt(6)]
      : String(body.name || "").trim();
    if (name.length < 2 || name.length > 60)
      fail("Your name should have between 2 and 60 characters.");
    const email = demo
      ? `fan-${id.slice(0, 8)}@demo.seatwise.app`
      : emailValue(body.email);
    const password = demo ? randomUUID() : String(body.password || "");
    if (password.length < 8 || password.length > 128)
      fail("Use a password with 8–128 characters.");
    const wallet = randomInt(90, 181) * 100;
    const hashed = hashPassword(password);
    user = await sql.begin(async (tx) => {
      const exists = await tx`SELECT id FROM users WHERE email=${email}`;
      if (exists.length)
        fail(
          "This email already has an account. Sign in instead.",
          409,
          "EMAIL_EXISTS",
        );
      const [u] =
        await tx`INSERT INTO users(id,name,email,password_hash,wallet) VALUES(${id},${name},${email},${hashed},${wallet}) RETURNING *`;
      await tx`INSERT INTO wallet_ledger(id,user_id,amount,kind,reference) VALUES(${randomUUID()},${id},${wallet},'Welcome credit',${`welcome:${id}`})`;
      await activity(tx, id, null, "signup", { demo });
      return u;
    });
  }
  const token = await createSession(user.id);
  return reply({ user: publicUser(user) }, 200, sessionCookie(token, request));
}

async function joinQueue(eventId, user, body) {
  const quantity = integer(body.quantity, 1, 4);
  const classId = String(body.classId || "");
  return withEvent(eventId, async (tx, event) => {
    if (event.details.salesOpenAt) await requireLaunchAccess(tx, eventId, user.id);
    const [cls] =
      await tx`SELECT id FROM classes WHERE event_id=${eventId} AND id=${classId}`;
    if (!cls) fail("Choose an available ticket class.");
    const [owned] =
      await tx`SELECT count(t.id)::int AS count FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE b.event_id=${eventId} AND b.user_id=${user.id} AND b.state='confirmed'`;
    if (owned.count + quantity > 4)
      fail(
        "There is a four-ticket limit per person for each event. Confirmed tickets and your new selection count towards it.",
        409,
        "TICKET_LIMIT",
      );
    const [existing] =
      await tx`SELECT * FROM queue_entries WHERE event_id=${eventId} AND user_id=${user.id} AND state IN ${tx(activeQueue)}`;
    if (existing?.class_id === classId && existing.quantity === quantity)
      return snapshot(tx, eventId, user.id);
    if (existing?.state === "holding")
      fail(
        "Release your current seats before changing class or ticket quantity.",
        409,
        "ACTIVE_HOLD",
      );
    if (existing)
      await tx`UPDATE queue_entries SET state='cancelled' WHERE id=${existing.id}`;
    const [attempts] =
      await tx`SELECT count(*)::int AS count FROM activity WHERE user_id=${user.id} AND kind='queue_join' AND created_at>now()-interval '10 minutes'`;
    if (attempts.count >= 20)
      fail(
        "You have changed booking queues frequently. Please take a 10-minute break.",
        429,
        "BOOKING_COOLDOWN",
      );
    await tx`INSERT INTO queue_entries(id,event_id,user_id,class_id,quantity) VALUES(${randomUUID()},${eventId},${user.id},${classId},${quantity})`;
    await activity(tx, user.id, eventId, "queue_join", { classId, quantity });
    // Joining without freeing capacity cannot advance another class. Avoid
    // rechecking every waiting class when this one is already full.
    if (existing?.state === 'admitted' || await spareCapacity(tx, eventId, classId))
      await promote(tx, eventId);
    return snapshot(tx, eventId, user.id);
  });
}

async function requireLaunchAccess(tx, eventId, userId) {
  const [event] = await tx`SELECT details FROM events WHERE id=${eventId}`;
  if (!event.details.salesOpenAt) return;
  const launch = await launchSnapshot(tx, eventId, userId, event.details);
  if (!launch.canBook) fail('Ticket booking is not open for you yet. Join the launch waiting room and wait for your batch.', 409, 'LAUNCH_WAIT');
}

async function joinLaunch(eventId, user) {
  return withEvent(eventId, async tx => {
    const [event] = await tx`SELECT details FROM events WHERE id=${eventId}`;
    const launch = await launchSnapshot(tx, eventId, user.id, event.details);
    if (launch.phase === 'scheduled') fail('The launch waiting room opens 30 minutes before ticket sales.', 409, 'ROOM_NOT_OPEN');
    if (launch.canBook) return snapshot(tx, eventId, user.id);
    const [existing] = await tx`SELECT queue_number FROM launch_entries WHERE event_id=${eventId} AND user_id=${user.id}`;
    if (!existing) {
      await tx`INSERT INTO launch_entries(event_id,user_id,queue_number)
        SELECT ${eventId},${user.id},COALESCE(max(queue_number),0)+1 FROM launch_entries WHERE event_id=${eventId}`;
      await activity(tx, user.id, eventId, 'launch_join');
    }
    return snapshot(tx, eventId, user.id);
  });
}

async function release(tx, eventId, userId, state = "released") {
  const holds =
    await tx`UPDATE holds SET state=${state} WHERE event_id=${eventId} AND user_id=${userId} AND state='active' RETURNING id`;
  for (const hold of holds)
    await tx`UPDATE seats SET status='available',hold_id=NULL WHERE event_id=${eventId} AND hold_id=${hold.id} AND status='held'`;
  await tx`UPDATE queue_entries SET state='cancelled' WHERE event_id=${eventId} AND user_id=${userId} AND state IN ${tx(activeQueue)}`;
}

export async function selectSeats(eventId, user, body) {
  return withEvent(eventId, async (tx, event) => {
    if (event.details.salesOpenAt) await requireLaunchAccess(tx, eventId, user.id);
    const [queue] =
      await tx`SELECT * FROM queue_entries WHERE event_id=${eventId} AND user_id=${user.id} AND (state='holding' OR (state='admitted' AND expires_at>clock_timestamp()))`;
    if (!queue)
      fail(
        "Join this ticket class first. You will be admitted when capacity is available.",
        409,
        "ADMISSION_REQUIRED",
      );
    let [hold] =
      await tx`SELECT * FROM holds WHERE event_id=${eventId} AND user_id=${user.id} AND state='active' AND expires_at>clock_timestamp()`;
    if (queue.state === 'holding' && !hold)
      fail('Your seat hold has expired. Refresh and join booking again.', 409, 'HOLD_EXPIRED');
    const auto = body.mode === "auto";
    if (hold?.mode === "auto")
      fail(
        "Auto-pick has locked your random seats. Continue to checkout or release the reservation.",
        409,
        "AUTO_LOCKED",
      );
    if (auto && hold)
      fail(
        "Release your manual selection before using auto-pick.",
        409,
        "ACTIVE_HOLD",
      );
    let ids;
    if (auto) {
      const rows =
        await tx`SELECT id FROM seats WHERE event_id=${eventId} AND class_id=${queue.class_id} AND status='available' ORDER BY random() LIMIT ${queue.quantity}`;
      ids = rows.map((s) => s.id);
      if (ids.length !== queue.quantity)
        fail(
          "Those seats just became unavailable. Your booking status has been refreshed.",
          409,
          "SEAT_CONFLICT",
        );
    } else {
      const seatId = String(body.seatId || "");
      const [seat] =
        await tx`SELECT * FROM seats WHERE event_id=${eventId} AND id=${seatId}`;
      if (!seat || seat.class_id !== queue.class_id)
        fail(
          "This seat belongs to a different ticket class. Change your class before selecting it.",
          409,
          "WRONG_CLASS",
        );
      if (hold && seat.hold_id === hold.id && seat.status === "held") {
        await tx`UPDATE seats SET status='available',hold_id=NULL WHERE event_id=${eventId} AND id=${seatId}`;
        return snapshot(tx, eventId, user.id);
      }
      if (seat.status !== "available")
        fail(
          "Someone else already holds this seat. Pick another available seat.",
          409,
          "SEAT_CONFLICT",
        );
      const [held] =
        await tx`SELECT count(*)::int AS count FROM seats WHERE hold_id=${hold?.id || null} AND status='held'`;
      if (held.count >= queue.quantity)
        fail(
          "Your selection is full. Deselect a seat to choose a different one.",
          409,
          "SELECTION_FULL",
        );
      ids = [seatId];
    }
    if (!hold) {
      [hold] =
        await tx`INSERT INTO holds(id,event_id,user_id,class_id,mode) VALUES(${randomUUID()},${eventId},${user.id},${queue.class_id},${auto ? "auto" : "manual"}) RETURNING *`;
      await tx`UPDATE queue_entries SET state='holding',hold_id=${hold.id} WHERE id=${queue.id}`;
    }
    const claimed =
      await tx`UPDATE seats SET status='held',hold_id=${hold.id} WHERE event_id=${eventId} AND class_id=${queue.class_id} AND id IN ${tx(ids)} AND status='available' RETURNING id`;
    if (claimed.length !== ids.length)
      fail(
        "A seat was taken during selection. Please try again.",
        409,
        "SEAT_CONFLICT",
      );
    await activity(tx, user.id, eventId, "seat_hold", {
      seats: ids,
      mode: hold.mode,
    });
    return snapshot(tx, eventId, user.id);
  });
}

export async function checkout(eventId, user, body) {
  const key = String(body.key || "");
  if (key.length < 12 || key.length > 100)
    fail("A valid payment request identifier is required.");
  const outcome = body.outcome || "success";
  if (!["success", "failure", "timeout"].includes(outcome))
    fail("Unknown mock payment outcome.");
  return withEvent(eventId, async (tx) => {
    // The event lock serializes retries as well as new payments for these seats.
    const [previous] =
      await tx`SELECT result,hold_id FROM payments WHERE user_id=${user.id} AND key=${key}`;
    if (previous) {
      if (previous.hold_id !== body.holdId)
        fail(
          "This payment identifier belongs to another reservation.",
          409,
          "IDEMPOTENCY_CONFLICT",
        );
      return previous.result;
    }
    const [wallet] =
      await tx`SELECT wallet FROM users WHERE id=${user.id} FOR UPDATE`;
    const [hold] =
      await tx`SELECT * FROM holds WHERE id=${String(body.holdId || "")} AND user_id=${user.id} AND event_id=${eventId} AND state='active' AND expires_at>clock_timestamp()`;
    if (!hold)
      fail(
        "Your seat hold has expired or was released. No money was deducted. Join the booking queue again.",
        409,
        "HOLD_EXPIRED",
      );
    const [queue] =
      await tx`SELECT quantity FROM queue_entries WHERE hold_id=${hold.id} AND state='holding'`;
    const seats =
      await tx`SELECT s.id,c.price FROM seats s JOIN classes c ON c.event_id=s.event_id AND c.id=s.class_id WHERE s.hold_id=${hold.id} AND s.status='held' ORDER BY s.id`;
    if (!queue || seats.length !== queue.quantity)
      fail(
        "Select all of your seats before paying.",
        409,
        "INCOMPLETE_SELECTION",
      );
    const total = seats.reduce((n, s) => n + s.price, 0);
    let result;
    if (outcome !== "success" || wallet.wallet < total) {
      await release(tx, eventId, user.id, "failed");
      result = {
        ok: false,
        message:
          wallet.wallet < total
            ? "Your demo wallet has insufficient funds. Your seats have been released."
            : outcome === "timeout"
              ? "Mock payment timed out. No money was deducted and your seats have been released."
              : "Mock payment failed. No money was deducted and your seats have been released.",
        wallet: wallet.wallet,
      };
      await activity(tx, user.id, eventId, "payment_failed", {
        reason: wallet.wallet < total ? "insufficient_balance" : outcome,
      });
    } else {
      const id = randomUUID();
      const reference = `SW-${id.slice(0, 8).toUpperCase()}`;
      await tx`INSERT INTO bookings(id,reference,user_id,event_id,hold_id,total) VALUES(${id},${reference},${user.id},${eventId},${hold.id},${total})`;
      await tx`UPDATE seats SET status='booked',booking_id=${id},hold_id=NULL WHERE hold_id=${hold.id} AND status='held'`;
      await tx`UPDATE holds SET state='confirmed' WHERE id=${hold.id}`;
      await tx`UPDATE queue_entries SET state='completed' WHERE hold_id=${hold.id}`;
      for (const seat of seats)
        await tx`INSERT INTO tickets(id,booking_id,event_id,seat_id) VALUES(${randomUUID()},${id},${eventId},${seat.id})`;
      await tx`UPDATE users SET wallet=wallet-${total} WHERE id=${user.id}`;
      await tx`INSERT INTO wallet_ledger(id,user_id,amount,kind,reference) VALUES(${randomUUID()},${user.id},${-total},'Tickets purchased',${`purchase:${id}`})`;
      await activity(tx, user.id, eventId, "booking_confirmed", {
        reference,
        quantity: seats.length,
        total,
      });
      result = {
        ok: true,
        bookingId: id,
        reference,
        wallet: wallet.wallet - total,
        message: "You’re going! Your tickets are in your wallet.",
      };
    }
    await tx`INSERT INTO payments(id,user_id,key,hold_id,outcome,result) VALUES(${randomUUID()},${user.id},${key},${hold.id},${result.ok ? "success" : "failure"},${tx.json(result)})`;
    await promote(tx, eventId);
    return result;
  });
}

async function getBookings(user) {
  const sql = database();
  const bookings =
    await sql`SELECT b.*,e.title,e.details FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.user_id=${user.id} ORDER BY b.created_at DESC`;
  for (const booking of bookings) {
    const tickets =
      await sql`SELECT t.*,s.class_id,c.name AS class_name FROM tickets t JOIN seats s ON s.event_id=t.event_id AND s.id=t.seat_id JOIN classes c ON c.event_id=s.event_id AND c.id=s.class_id WHERE t.booking_id=${booking.id} ORDER BY t.seat_id`;
    booking.tickets = tickets.map((t) => ({
      ...t,
      token: booking.state === "confirmed" ? qrToken(t) : null,
    }));
  }
  return { bookings };
}

export async function cancelBooking(bookingId, user) {
  const sql = database();
  const [initial] =
    await sql`SELECT event_id FROM bookings WHERE id=${bookingId} AND user_id=${user.id}`;
  if (!initial) fail("Booking not found.", 404, "BOOKING_NOT_FOUND");
  return withEvent(initial.event_id, async (tx, event) => {
    const [booking] =
      await tx`SELECT * FROM bookings WHERE id=${bookingId} AND user_id=${user.id} FOR UPDATE`;
    if (booking.state === "cancelled")
      return { ok: true, message: "This booking is already cancelled." };
    if (new Date(event.details.date).getTime() - Date.now() < 2 * 3600000)
      fail(
        "Cancellations close two hours before the show starts.",
        409,
        "CANCELLATION_CLOSED",
      );
    const used =
      await tx`SELECT id FROM tickets WHERE booking_id=${bookingId} AND checked_in_at IS NOT NULL`;
    if (used.length)
      fail(
        "A checked-in booking cannot be cancelled.",
        409,
        "ALREADY_CHECKED_IN",
      );
    await tx`UPDATE bookings SET state='cancelled',cancelled_at=now() WHERE id=${bookingId}`;
    await tx`UPDATE seats SET status='available',booking_id=NULL WHERE booking_id=${bookingId} AND status='booked'`;
    await tx`UPDATE tickets SET version=version+1 WHERE booking_id=${bookingId}`;
    await tx`UPDATE users SET wallet=wallet+${booking.total} WHERE id=${user.id}`;
    await tx`INSERT INTO wallet_ledger(id,user_id,amount,kind,reference) VALUES(${randomUUID()},${user.id},${booking.total},'Booking refunded',${`refund:${bookingId}`})`;
    await activity(tx, user.id, booking.event_id, "booking_cancelled", {
      reference: booking.reference,
      total: booking.total,
    });
    await promote(tx, booking.event_id);
    return {
      ok: true,
      message:
        "Booking cancelled. The full amount is back in your demo wallet.",
    };
  });
}

async function inventory(eventId, user, body) {
  return withEvent(eventId, async (tx) => {
    const classId = String(body.classId || "");
    if (!["reserve", "release"].includes(body.action))
      fail("Choose reserve or release.");
    const count = integer(body.quantity, 1, 400);
    if (body.action === "reserve") {
      if (count > (await spareCapacity(tx, eventId, classId)))
        fail(
          "That quantity would take capacity already promised to admitted customers. Reserve fewer seats.",
          409,
          "CAPACITY_PROMISED",
        );
      const seats =
        await tx`SELECT id FROM seats WHERE event_id=${eventId} AND class_id=${classId} AND status='available' ORDER BY id LIMIT ${count}`;
      if (seats.length !== count)
        fail("Not enough available seats in this class.", 409, "NO_CAPACITY");
      await tx`UPDATE seats SET status='reserved',reserved_reason=${String(body.reason || "Organiser allocation").slice(0, 200)} WHERE event_id=${eventId} AND id IN ${tx(seats.map((s) => s.id))}`;
    } else {
      const seats =
        await tx`SELECT id FROM seats WHERE event_id=${eventId} AND class_id=${classId} AND status='reserved' ORDER BY id LIMIT ${count}`;
      if (!seats.length)
        fail("There are no organiser-reserved seats to release in this class.");
      await tx`UPDATE seats SET status='available',reserved_reason=NULL WHERE event_id=${eventId} AND id IN ${tx(seats.map((s) => s.id))}`;
    }
    await activity(tx, user.id, eventId, `admin_${body.action}`, {
      classId,
      quantity: count,
    });
    await promote(tx, eventId);
    return snapshot(tx, eventId, user.id);
  });
}

async function scanTicket(user, body) {
  const token = String(body.token || "").trim();
  const match = /^SW1\.([0-9a-f-]{36})\.([\w-]{43})$/.exec(token);
  if (!match)
    fail("This is not a valid SeatWise ticket.", 400, "INVALID_TICKET");
  const [known] =
    await database()`SELECT event_id FROM tickets WHERE id=${match[1]}`;
  if (!known) fail("Ticket not found.", 404, "INVALID_TICKET");
  if (body.eventId && body.eventId !== known.event_id)
    fail("This ticket is for a different event.", 409, "WRONG_EVENT");
  return withEvent(known.event_id, async (tx) => {
    const [ticket] =
      await tx`SELECT t.*,b.state,b.reference,u.name,e.title FROM tickets t JOIN bookings b ON b.id=t.booking_id JOIN users u ON u.id=b.user_id JOIN events e ON e.id=t.event_id WHERE t.id=${match[1]} FOR UPDATE OF t`;
    if (!verifyToken(token, ticket) || ticket.state !== "confirmed")
      fail(
        "This ticket has been cancelled, changed, or is invalid.",
        409,
        "REVOKED_TICKET",
      );
    if (ticket.checked_in_at)
      fail(
        `Already checked in at ${new Date(ticket.checked_in_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}. Do not admit again.`,
        409,
        "ALREADY_USED",
      );
    await tx`UPDATE tickets SET checked_in_at=now() WHERE id=${ticket.id}`;
    await activity(tx, user.id, ticket.event_id, "ticket_scanned", {
      seat: ticket.seat_id,
      reference: ticket.reference,
    });
    return {
      ok: true,
      name: ticket.name,
      seat: ticket.seat_id,
      event: ticket.title,
      reference: ticket.reference,
      message: "Valid ticket. Entry approved.",
    };
  });
}

async function adminStats() {
  const sql = database();
  return sql.begin(async (tx) => {
    const events = await tx`SELECT e.id,e.details,clock_timestamp() AS now,
      EXISTS(SELECT 1 FROM holds h WHERE h.event_id=e.id AND h.state='active' AND h.expires_at<=clock_timestamp()) AS expired_holds,
      EXISTS(SELECT 1 FROM queue_entries q WHERE q.event_id=e.id AND q.state='admitted' AND q.expires_at<=clock_timestamp()) AS expired_admissions
      FROM events e ORDER BY e.id FOR UPDATE OF e`;
    for (const event of events) await maintain(tx, event.id, event);
    const [totals] = await tx`SELECT
      (SELECT count(*)::int FROM users WHERE role='user') AS users,
      (SELECT count(*)::int FROM users WHERE role='user' AND created_at>now()-interval '24 hours') AS signups,
      (SELECT count(DISTINCT user_id)::int FROM activity WHERE created_at>now()-interval '5 minutes') AS online,
      (SELECT count(*)::int FROM activity WHERE kind='event_view') AS visits,
      (SELECT count(*)::int FROM bookings WHERE state='confirmed') AS bookings,
      (SELECT COALESCE(sum(total),0)::int FROM bookings WHERE state='confirmed') AS revenue,
      ((SELECT count(*) FROM queue_entries WHERE state='waiting') + (SELECT count(*) FROM launch_entries WHERE admitted_at IS NULL))::int AS waiting,
      (SELECT count(*)::int FROM seats WHERE status='held') AS held,
      (SELECT count(*)::int FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE b.state='confirmed' AND t.checked_in_at IS NOT NULL) AS checkins`;
    const eventStats = await tx`SELECT e.id,e.title,e.details,
      count(s.id)::int AS capacity,
      count(s.id) FILTER(WHERE s.status='available')::int AS available,
      count(s.id) FILTER(WHERE s.status='held')::int AS held,
      count(s.id) FILTER(WHERE s.status='booked')::int AS booked,
      count(s.id) FILTER(WHERE s.status='reserved')::int AS reserved,
      (SELECT COALESCE(sum(b.total),0)::int FROM bookings b WHERE b.event_id=e.id AND b.state='confirmed') AS revenue,
      (SELECT count(*)::int FROM queue_entries q WHERE q.event_id=e.id AND q.state='waiting') AS waiting,
      (SELECT count(*)::int FROM launch_entries l WHERE l.event_id=e.id AND l.admitted_at IS NULL) AS launch_waiting,
      (SELECT count(*)::int FROM launch_entries l WHERE l.event_id=e.id AND l.admitted_at IS NOT NULL) AS launch_admitted,
      (SELECT count(*)::int FROM activity a WHERE a.event_id=e.id AND a.kind='event_view') AS visits
      FROM events e JOIN seats s ON s.event_id=e.id GROUP BY e.id ORDER BY e.details->>'date'`;
    const traffic = await tx`SELECT date_trunc('hour',created_at) AS hour,
      count(*) FILTER(WHERE kind='event_view')::int AS visits,
      count(*) FILTER(WHERE kind='booking_confirmed')::int AS bookings,
      count(*) FILTER(WHERE kind='signup')::int AS signups
      FROM activity WHERE created_at>now()-interval '24 hours' GROUP BY 1 ORDER BY 1`;
    const eventTraffic =
      await tx`SELECT event_id,date_trunc('hour',created_at) AS hour,
      count(*) FILTER(WHERE kind='event_view')::int AS visits,
      count(*) FILTER(WHERE kind='booking_confirmed')::int AS bookings
      FROM activity WHERE event_id IS NOT NULL AND created_at>now()-interval '24 hours' GROUP BY 1,2 ORDER BY 2`;
    const recent =
      await tx`SELECT a.*,u.name,e.title FROM activity a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN events e ON e.id=a.event_id ORDER BY a.created_at DESC LIMIT 30`;
    const users = await tx`SELECT u.id,u.name,u.email,u.wallet,u.created_at,
      (SELECT count(*)::int FROM bookings b WHERE b.user_id=u.id AND b.state='confirmed') AS bookings
      FROM users u WHERE u.role='user' ORDER BY u.created_at DESC LIMIT 50`;
    const alerts = await tx`SELECT u.name,u.email,a.user_id,
      count(*) FILTER(WHERE a.kind='hold_expired')::int AS expirations,
      count(*) FILTER(WHERE a.kind='queue_join')::int AS queue_changes,
      count(*) FILTER(WHERE a.kind='payment_failed')::int AS failures
      FROM activity a JOIN users u ON u.id=a.user_id WHERE a.created_at>now()-interval '1 hour'
      GROUP BY a.user_id,u.name,u.email
      HAVING count(*) FILTER(WHERE a.kind='hold_expired')>=3 OR count(*) FILTER(WHERE a.kind='queue_join')>=8 OR count(*) FILTER(WHERE a.kind='payment_failed')>=3`;
    return {
      totals,
      events: eventStats,
      traffic,
      eventTraffic,
      recent,
      users,
      alerts,
      serverTime: new Date().toISOString(),
    };
  });
}

async function createEvent(user, body) {
  const banner = resolveBanner(body.bannerTemplate || 'bloom');
  if (!banner) fail('Choose one of the available banner templates.');
  const title = String(body.title || "").trim();
  if (title.length < 3 || title.length > 80)
    fail("Event title must have 3–80 characters.");
  const date = new Date(body.date);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 3600000)
    fail("Choose a future event date.");
  const basePrice = integer(body.basePrice, 100, 25000, "Starting price");
  let salesOpenAt = null;
  if (body.salesOpenAt) {
    const salesDate = new Date(body.salesOpenAt);
    if (!Number.isFinite(salesDate.getTime()) || salesDate.getTime() <= Date.now() || salesDate >= date)
      fail('Ticket release must be in the future and before the show starts.');
    salesOpenAt = salesDate.toISOString();
  }
  const id =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    randomUUID().slice(0, 5);
  const details = {
    id,
    title,
    date: date.toISOString(),
    salesOpenAt,
    category: String(body.category || "Live music").slice(0, 30),
    venue: String(body.venue || "Echo Arena").slice(0, 80),
    city: "Bengaluru",
    image: banner.image,
    bannerTemplate: banner.id,
    color: "#d5fd71",
    artist: String(body.artist || "Your next favourite night.").slice(0, 100),
    tag: "JUST ANNOUNCED",
    description: String(
      body.description || "A live experience worth being there for.",
    ).slice(0, 1000),
    lineup: [],
    doors: "One hour before showtime",
    duration: "3 hours",
    basePrice,
  };
  await database().begin(async (tx) => {
    await tx`INSERT INTO events(id,title,details) VALUES(${id},${title},${tx.json(details)})`;
    for (const cls of ticketClasses)
      await tx`INSERT INTO classes(event_id,id,name,price,details) VALUES(${id},${cls.id},${cls.name},${Math.round(basePrice * cls.multiplier)},${tx.json(cls)})`;
    const seats = seatLayout().map((s) => ({
      event_id: id,
      id: s.id,
      class_id: s.classId,
      row_label: s.row,
      number: s.number,
      x: s.x,
      y: s.y,
      rotation: s.rotation,
    }));
    await tx`INSERT INTO seats ${tx(seats)}`;
    await activity(tx, user.id, id, "event_created");
  });
  return { ok: true, id };
}

export async function dispatch(request) {
  try {
    const url = new URL(request.url),
      path = url.pathname.slice(5).split("/").filter(Boolean),
      method = request.method;
    if (method !== "GET" && method !== "HEAD") {
      const origin = request.headers.get("origin");
      const publicHost =
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        url.host;
      if (origin && new URL(origin).host !== publicHost)
        fail("Cross-site requests are not allowed.", 403, "ORIGIN");
      if (Number(request.headers.get("content-length") || 0) > 20000)
        fail("Request too large.", 413);
    }
    if (path[0] === "health") {
      const sql = database();
      await sql`SELECT 1`;
      return reply({
        ok: true,
        database: "connected",
        storage: "PostgreSQL",
        version: "1.0.0",
      });
    }
    const user = await currentUser(request);
    let body = {};
    if (method === "POST") {
      try {
        body = await request.json();
      } catch {
        fail("Send a valid JSON request.");
      }
    }
    if (
      path[0] === "auth" &&
      ["login", "signup", "demo"].includes(path[1]) &&
      method === "POST"
    )
      return await signIn(request, body, path[1]);
    if (path[0] === "auth" && path[1] === "logout" && method === "POST") {
      const raw = (request.headers.get("cookie") || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("sw_session="))
        ?.slice(11);
      if (raw)
        await database()`DELETE FROM sessions WHERE digest=${digest(raw)}`;
      return reply({ ok: true }, 200, sessionCookie("", request, true));
    }
    if (path[0] === "me") return reply({ user: publicUser(user) });
    if (path[0] === "events" && path.length === 1 && method === "GET") {
      const events = await database()`SELECT e.id,e.title,e.details,
        count(s.id)::int AS capacity,
        count(s.id) FILTER(WHERE s.status='available' OR (s.status='held' AND h.expires_at<=now()))::int AS available
        FROM events e JOIN seats s ON s.event_id=e.id LEFT JOIN holds h ON h.id=s.hold_id
        WHERE e.details->>'isTest' IS DISTINCT FROM 'true' GROUP BY e.id ORDER BY e.details->>'date'`;
      return reply({
        events: events.map((e) => ({
          ...e.details,
          id: e.id,
          title: e.title,
          capacity: e.capacity,
          available: e.available,
          launchPending: !!e.details.salesOpenAt && !e.details.launchCompletedAt,
        })),
      });
    }
    if (path[0] === "events" && path[1]) {
      const eventId = path[1];
      if (path.length === 2 && method === "GET") {
        const sql = database();
        const [known] = await sql`SELECT id,details,clock_timestamp() AS now FROM events WHERE id=${eventId}`;
        if (!known)
          fail("This event could not be found.", 404, "EVENT_NOT_FOUND");
        if (url.searchParams.get("track") === "1")
          await activity(sql, user?.id, eventId, "event_view");
        const [expired] =
          await sql`SELECT EXISTS(SELECT 1 FROM holds WHERE event_id=${eventId} AND state='active' AND expires_at<=clock_timestamp())
          OR EXISTS(SELECT 1 FROM queue_entries WHERE event_id=${eventId} AND state='admitted' AND expires_at<=clock_timestamp()) AS needed`;
        const launchDue = known.details.salesOpenAt && !known.details.launchCompletedAt
          && new Date(known.now) >= new Date(known.details.launchNextBatchAt || known.details.salesOpenAt);
        if (expired.needed || launchDue)
          return reply(
            await withEvent(eventId, (tx) => snapshot(tx, eventId, user?.id)),
          );
        // Availability reads are consistent snapshots, not exclusive event locks.
        // Actual admission, seat claims, payment, and expiry always take the lock.
        return reply(
          await sql.begin("isolation level repeatable read read only", (tx) =>
            snapshot(tx, eventId, user?.id),
          ),
        );
      }
      needUser(user);
      if (path[2] === "launch" && method === "POST")
        return reply(await joinLaunch(eventId, user));
      if (path[2] === "join" && method === "POST")
        return reply(await joinQueue(eventId, user, body));
      if (path[2] === "hold" && method === "POST")
        return reply(await selectSeats(eventId, user, body));
      if (path[2] === "pay" && method === "POST")
        return reply(await checkout(eventId, user, body));
      if (path[2] === "leave" && method === "POST")
        return reply(
          await withEvent(eventId, async (tx) => {
            await release(tx, eventId, user.id);
            await activity(tx, user.id, eventId, "hold_released");
            await promote(tx, eventId);
            return snapshot(tx, eventId, user.id);
          }),
        );
    }
    if (path[0] === "bookings") {
      needUser(user);
      if (path.length === 1 && method === "GET")
        return reply(await getBookings(user));
      if (path[2] === "cancel" && method === "POST")
        return reply(await cancelBooking(path[1], user));
    }
    if (path[0] === "wallet") {
      needUser(user);
      const ledger =
        await database()`SELECT id,amount,kind,created_at FROM wallet_ledger WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 50`;
      return reply({ balance: user.wallet, ledger });
    }
    if (path[0] === "admin") {
      needAdmin(user);
      if (path[1] === "stats" && method === "GET")
        return reply(await adminStats());
      if (path[1] === "inventory" && method === "POST")
        return reply(await inventory(String(body.eventId), user, body));
      if (path[1] === "scan" && method === "POST")
        return reply(await scanTicket(user, body));
      if (path[1] === "events" && method === "POST")
        return reply(await createEvent(user, body), 201);
    }
    fail("This endpoint does not exist.", 404, "NOT_FOUND");
  } catch (error) {
    if (error instanceof AppError)
      return reply({ error: error.message, code: error.code }, error.status);
    if (error.code === "23505")
      return reply(
        {
          error:
            "This request was already processed or the account already exists. Refresh and try again.",
          code: "CONFLICT",
        },
        409,
      );
    if (error.code === "22P02")
      return reply(
        { error: "Invalid request identifier.", code: "INVALID_ID" },
        400,
      );
    console.error("SeatWise API:", error.message);
    return reply(
      {
        error: process.env.DATABASE_URL
          ? "Something went wrong. Your booking has not been changed. Please try again."
          : "The shared database is not connected yet. Please finish database setup.",
        code: "SERVER_ERROR",
      },
      503,
    );
  }
}
