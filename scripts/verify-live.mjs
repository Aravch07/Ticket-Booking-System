const base = process.env.TEST_BASE_URL || "https://seatwise-gamma.vercel.app";
async function call(path, body, cookie) {
  const response = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `${path}: ${response.status} ${data.error || "request failed"}`,
    );
  return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
const health = await call("/health");
console.log("Public database health:", health.data.database);
const login = await call("/auth/login", {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
const stats = await call("/admin/stats", null, login.cookie);
console.log("Organiser login: passed");
console.log("Live analytics:", {
  events: stats.data.events.length,
  registeredUsers: stats.data.totals.users,
  bookings: stats.data.totals.bookings,
  netDemoSales: stats.data.totals.revenue,
  trafficRecords: stats.data.eventTraffic.length,
});
const accounted = stats.data.events.every(
  (e) => e.available + e.held + e.booked + e.reserved === e.capacity,
);
if (!accounted) throw new Error("Inventory totals do not reconcile.");
console.log("Every event inventory total reconciles.");
await call("/auth/logout", {}, login.cookie);
