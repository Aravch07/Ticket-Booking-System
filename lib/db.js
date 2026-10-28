import { createDatabase } from "./sql.js";
import { maintainLaunch, launchSnapshot } from './launch.js';

let instance;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "The shared database is not connected. Please configure DATABASE_URL.",
    );
  if (!instance) instance = createDatabase(process.env.DATABASE_URL);
  return instance;
}
export class AppError extends Error {
  constructor(message, status = 400, code = "INVALID_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fail = (message, status, code) => {
  throw new AppError(message, status, code);
};

export async function activity(tx, userId, eventId, kind, details = {}) {
  await tx`INSERT INTO activity(user_id,event_id,kind,details) VALUES(${userId || null},${eventId || null},${kind},${tx.json(details)})`;
}

// Every inventory mutation first locks its event row. The lock lives in Postgres,
// so this invariant holds across concurrent requests AND independent Vercel instances.
export async function withEvent(eventId, operation) {
  return database().begin(async (tx) => {
    const [event] =
      await tx`SELECT e.*,clock_timestamp() AS now,
        EXISTS(SELECT 1 FROM holds h WHERE h.event_id=e.id AND h.state='active' AND h.expires_at<=clock_timestamp()) AS expired_holds,
        EXISTS(SELECT 1 FROM queue_entries q WHERE q.event_id=e.id AND q.state='admitted' AND q.expires_at<=clock_timestamp()) AS expired_admissions
        FROM events e WHERE e.id=${eventId} FOR UPDATE OF e`;
    if (!event) fail("This event could not be found.", 404, "EVENT_NOT_FOUND");
    await maintain(tx, eventId, event);
    return operation(tx, event);
  });
}

export async function maintain(tx, eventId, event) {
  await maintainLaunch(tx, eventId, event);
  if (event && !event.expired_holds && !event.expired_admissions) return;
  const expired =
    await tx`UPDATE holds SET state='expired' WHERE event_id=${eventId} AND state='active' AND expires_at<=clock_timestamp() RETURNING id,user_id`;
  for (const hold of expired) {
    await tx`UPDATE seats SET status='available',hold_id=NULL WHERE event_id=${eventId} AND status='held' AND hold_id=${hold.id}`;
    await tx`UPDATE queue_entries SET state='expired' WHERE hold_id=${hold.id} AND state='holding'`;
    await activity(tx, hold.user_id, eventId, "hold_expired");
  }
  await tx`UPDATE queue_entries SET state='expired' WHERE event_id=${eventId} AND state='admitted' AND expires_at<=clock_timestamp()`;
  await promote(tx, eventId);
}

export async function spareCapacity(tx, eventId, classId) {
  const [row] = await tx`
    SELECT (SELECT count(*) FROM seats WHERE event_id=${eventId} AND class_id=${classId} AND status='available')::int
      - COALESCE((SELECT sum(q.quantity - (SELECT count(*) FROM seats s WHERE s.hold_id=q.hold_id AND s.status='held'))
          FROM queue_entries q WHERE q.event_id=${eventId} AND q.class_id=${classId} AND q.state IN ('admitted','holding')),0)::int AS spare`;
  return Math.max(0, row.spare);
}

export async function promote(tx, eventId) {
  const [pending] =
    await tx`SELECT EXISTS(SELECT 1 FROM queue_entries WHERE event_id=${eventId} AND state='waiting') AS waiting`;
  if (!pending.waiting) return;
  const classes =
    await tx`SELECT id FROM classes WHERE event_id=${eventId} ORDER BY id`;
  for (const cls of classes) {
    let spare = await spareCapacity(tx, eventId, cls.id);
    const waiting =
      await tx`SELECT id,quantity FROM queue_entries WHERE event_id=${eventId} AND class_id=${cls.id} AND state='waiting' ORDER BY seq LIMIT 100`;
    for (const entry of waiting) {
      if (spare < entry.quantity) break; // Strict FIFO per class. Smaller groups do not jump the queue.
      await tx`UPDATE queue_entries SET state='admitted',expires_at=clock_timestamp()+interval '2 minutes' WHERE id=${entry.id}`;
      spare -= entry.quantity;
    }
  }
}

export async function snapshot(tx, eventId, userId) {
  const [event] =
    await tx`SELECT id,title,details FROM events WHERE id=${eventId}`;
  const classes = await tx`SELECT c.*, count(s.id)::int AS capacity,
    count(s.id) FILTER(WHERE s.status='available')::int AS available,
    count(s.id) FILTER(WHERE s.status='held')::int AS held,
    count(s.id) FILTER(WHERE s.status='booked')::int AS booked,
    count(s.id) FILTER(WHERE s.status='reserved')::int AS reserved,
    greatest(0,count(s.id) FILTER(WHERE s.status='available')::int
      - COALESCE((SELECT sum(q.quantity-(SELECT count(*) FROM seats owned WHERE owned.hold_id=q.hold_id AND owned.status='held'))
        FROM queue_entries q WHERE q.event_id=c.event_id AND q.class_id=c.id AND q.state IN ('admitted','holding')),0)::int)::int AS admissible
    FROM classes c JOIN seats s ON s.event_id=c.event_id AND s.class_id=c.id
    WHERE c.event_id=${eventId} GROUP BY c.event_id,c.id ORDER BY c.price DESC`;
  const seats =
    await tx`SELECT id,class_id AS "classId",row_label AS row,number,x,y,rotation,status FROM seats WHERE event_id=${eventId} ORDER BY row_label,number`;
  let queue = null,
    hold = null;
  if (userId) {
    [queue] =
      await tx`SELECT id,class_id AS "classId",quantity,state,expires_at AS "expiresAt",seq FROM queue_entries WHERE event_id=${eventId} AND user_id=${userId} AND state IN ('waiting','admitted','holding')`;
    if (queue?.state === "waiting") {
      const [position] =
        await tx`SELECT count(*)::int+1 AS position FROM queue_entries WHERE event_id=${eventId} AND class_id=${queue.classId} AND state='waiting' AND seq<${queue.seq}`;
      queue.position = position.position;
    }
    [hold] =
      await tx`SELECT id,mode,class_id AS "classId",expires_at AS "expiresAt" FROM holds WHERE event_id=${eventId} AND user_id=${userId} AND state='active'`;
    if (hold)
      hold.seats =
        await tx`SELECT id,class_id AS "classId" FROM seats WHERE hold_id=${hold.id} AND status='held' ORDER BY row_label,number`;
  }
  return {
    ...event.details,
    id: event.id,
    title: event.title,
    launch: await launchSnapshot(tx, eventId, userId, event.details),
    classes: classes.map((c) => ({
      ...c.details,
      ...c,
      details: undefined,
      event_id: undefined,
    })),
    seats,
    queue: queue || null,
    hold: hold || null,
    serverTime: new Date().toISOString(),
  };
}
