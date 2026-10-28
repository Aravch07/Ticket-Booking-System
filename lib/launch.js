// The launch queue controls access to booking, never ownership of seats.
// Call maintainLaunch/joinLaunch only while holding the event row lock.
export const LAUNCH_BATCH_SIZE = 100;
export const LAUNCH_INTERVAL_MS = 5 * 60 * 1000;
export const LAUNCH_PREVIEW_MS = 30 * 60 * 1000;

export async function maintainLaunch(tx, eventId, known) {
  if (known && (!known.details.salesOpenAt || known.details.launchCompletedAt)) return;
  const event = known || (await tx`SELECT details,clock_timestamp() AS now FROM events WHERE id=${eventId}`)[0];
  const d = event.details;
  if (!d.salesOpenAt || d.launchCompletedAt) return;
  const now = new Date(event.now).getTime();
  const opens = new Date(d.salesOpenAt).getTime();
  if (now < opens || (d.launchNextBatchAt && now < new Date(d.launchNextBatchAt).getTime())) return;
  const admitted = await tx`UPDATE launch_entries SET admitted_at=clock_timestamp()
    WHERE event_id=${eventId} AND queue_number IN
      (SELECT queue_number FROM launch_entries WHERE event_id=${eventId} AND admitted_at IS NULL ORDER BY queue_number LIMIT ${LAUNCH_BATCH_SIZE})
    RETURNING user_id,queue_number`;
  const [remaining] = await tx`SELECT count(*)::int AS count FROM launch_entries WHERE event_id=${eventId} AND admitted_at IS NULL`;
  // Missed slots do not accumulate: at most 100 enter in any five-minute slot,
  // even if the first request arrives long after sales opened.
  const next = new Date(opens + (Math.floor((now - opens) / LAUNCH_INTERVAL_MS) + 1) * LAUNCH_INTERVAL_MS).toISOString();
  await tx`UPDATE events SET details=details || ${tx.json({
    launchNextBatchAt: remaining.count ? next : null,
    launchCompletedAt: remaining.count ? null : new Date(event.now).toISOString(),
  })}::jsonb WHERE id=${eventId}`;
  if (admitted.length) await tx`INSERT INTO activity(event_id,kind,details) VALUES(${eventId},'launch_batch',${tx.json({ admitted: admitted.length, remaining: remaining.count })})`;
}

export async function launchSnapshot(tx, eventId, userId, details) {
  if (!details.salesOpenAt) return { phase:'open', salesOpenAt:null, waitingRoomAt:null, nextBatchAt:null, batchSize:LAUNCH_BATCH_SIZE, intervalMinutes:5, waiting:0, entry:null, canBook:true };
  const [row] = await tx`SELECT clock_timestamp() AS now,
    (SELECT count(*)::int FROM launch_entries WHERE event_id=${eventId} AND admitted_at IS NULL) AS waiting,
    (SELECT jsonb_build_object('queueNumber',l.queue_number,'admittedAt',l.admitted_at,'position',
      CASE WHEN l.admitted_at IS NULL THEN (SELECT count(*)::int+1 FROM launch_entries a WHERE a.event_id=${eventId} AND a.admitted_at IS NULL AND a.queue_number<l.queue_number) ELSE NULL END)
      FROM launch_entries l WHERE l.event_id=${eventId} AND l.user_id=${userId || null}) AS entry`;
  const now = new Date(row.now).getTime();
  const opens = details.salesOpenAt ? new Date(details.salesOpenAt).getTime() : null;
  const room = opens === null ? null : opens - LAUNCH_PREVIEW_MS;
  let phase = !opens || details.launchCompletedAt ? 'open'
    : now < room ? 'scheduled' : now < opens ? 'waiting_room' : 'releasing';
  const { entry, waiting } = row;
  return {
    phase, salesOpenAt: details.salesOpenAt || null,
    waitingRoomAt: room === null ? null : new Date(room).toISOString(),
    nextBatchAt: phase === 'waiting_room' ? details.salesOpenAt : phase === 'releasing' ? details.launchNextBatchAt || details.salesOpenAt : null,
    batchSize: LAUNCH_BATCH_SIZE, intervalMinutes: 5, waiting,
    entry: entry || null, canBook: phase === 'open' || !!entry?.admittedAt,
  };
}
