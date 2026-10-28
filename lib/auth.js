import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { database, fail } from "./db.js";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || hash.length !== 128) return false;
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    scryptSync(password, salt, 64),
  );
}
export function publicUser(user) {
  return user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        wallet: user.wallet,
      }
    : null;
}
export function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function secret() {
  if (!process.env.SESSION_SECRET)
    fail("The server security secret is not configured.", 503, "CONFIGURATION");
  return process.env.SESSION_SECRET;
}
export function qrToken(ticket) {
  return `SW1.${ticket.id}.${createHmac("sha256", secret()).update(`${ticket.id}:${ticket.version}`).digest("base64url")}`;
}
export function verifyToken(token, ticket) {
  const expected = qrToken(ticket);
  const a = Buffer.from(token),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function currentUser(request) {
  const token = (request.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("sw_session="))
    ?.slice(11);
  if (!token) return null;
  const [user] =
    await database()`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.digest=${digest(token)} AND s.expires_at>now()`;
  return user || null;
}
export async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  await database()`INSERT INTO sessions(digest,user_id,expires_at) VALUES(${digest(token)},${userId},now()+interval '7 days')`;
  return token;
}
export function sessionCookie(token, request, clear = false) {
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return `sw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 604800}${secure ? "; Secure" : ""}`;
}
export function needUser(user) {
  if (!user) fail("Sign in to continue.", 401, "SIGN_IN");
  return user;
}
export function needAdmin(user) {
  needUser(user);
  if (user.role !== "admin")
    fail("Organiser access is required.", 403, "FORBIDDEN");
  return user;
}
