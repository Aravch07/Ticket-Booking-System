import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { database } from "../lib/db.js";
import { hashPassword } from "../lib/auth.js";
import { catalog, ticketClasses, seatLayout } from "../lib/catalog.js";

if (process.env.DATABASE_URL_UNPOOLED)
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
const sql = database();
try {
  await sql.unsafe(
    await readFile(new URL("../lib/schema.sql", import.meta.url), "utf8"),
  );
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(814902)`;
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)
      throw new Error(
        "Set a unique ADMIN_PASSWORD with at least 12 characters.",
      );
    const adminEmail = process.env.ADMIN_EMAIL || "admin@seatwise.app";
    const existing = await tx`SELECT id FROM users WHERE email=${adminEmail}`;
    if (!existing.length)
      await tx`INSERT INTO users(id,name,email,password_hash,role,wallet) VALUES(${randomUUID()},'SeatWise organiser',${adminEmail},${hashPassword(process.env.ADMIN_PASSWORD)},'admin',50000)`;
    for (const event of catalog) {
      const found = await tx`SELECT id FROM events WHERE id=${event.id}`;
      if (found.length) continue;
      await tx`INSERT INTO events(id,title,details) VALUES(${event.id},${event.title},${tx.json(event)})`;
      for (const cls of ticketClasses)
        await tx`INSERT INTO classes(event_id,id,name,price,details) VALUES(${event.id},${cls.id},${cls.name},${Math.round(event.basePrice * cls.multiplier)},${tx.json(cls)})`;
      const seats = seatLayout().map((s, index) => ({
        event_id: event.id,
        id: s.id,
        class_id: s.classId,
        row_label: s.row,
        number: s.number,
        x: s.x,
        y: s.y,
        rotation: s.rotation,
        status:
          event.id === "laugh-track" ||
          (event.id === "afterhours" && s.classId === "vip") ||
          index % 11 === 0
            ? "reserved"
            : "available",
        reserved_reason:
          event.id === "laugh-track"
            ? "Sample fully allocated show"
            : event.id === "afterhours" && s.classId === "vip"
              ? "Sample production allocation"
              : index % 11 === 0
                ? "Sample guest-list allocation"
                : null,
      }));
      await tx`INSERT INTO seats ${tx(seats)}`;
    }
  });
  const [counts] =
    await sql`SELECT (SELECT count(*)::int FROM events) AS events,(SELECT count(*)::int FROM seats) AS seats`;
  console.log(
    `Database ready: ${counts.events} events, ${counts.seats} seats. Seed allocations are labelled sample/production reservations; no sales or traffic are fabricated.`,
  );
} finally {
  await sql.end();
}
