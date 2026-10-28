"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  LayoutDashboard,
  Users,
  Ticket,
  Wallet,
  ArrowUpRight,
  ArrowRight,
  ScanLine,
  ShieldCheck,
  Activity,
  Plus,
  ArrowLeft,
  LockKeyhole,
  Unlock,
  CalendarDays,
  AlertTriangle,
  Check,
  Camera,
  ImagePlus,
  X,
  RefreshCw,
  Eye,
  TrendingUp,
  Clock3,
} from "lucide-react";
import {
  api,
  useApp,
  money,
  fullDate,
  timeLabel,
  Button,
  Eyebrow,
  Pill,
  Modal,
  Empty,
  ErrorBox,
  Spinner,
} from "./ui.jsx";

const chartColors = {
  available: "#d5fd71",
  held: "#b8a4f8",
  booked: "#8fc7db",
  reserved: "#f4ca78",
};
const labels = {
  available: "Available",
  held: "Customer holds",
  booked: "Confirmed",
  reserved: "Organiser reserved",
};
const activityLabels = {
  signup: "Joined the crowd",
  event_view: "Viewed event",
  queue_join: "Joined booking queue",
  seat_hold: "Held seats",
  hold_expired: "Seat hold expired",
  hold_released: "Released reservation",
  payment_failed: "Payment failed",
  booking_confirmed: "Booking confirmed",
  booking_cancelled: "Booking refunded",
  admin_reserve: "Reserved inventory",
  admin_release: "Released inventory",
  ticket_scanned: "Ticket checked in",
  event_created: "Published event",
};
const tooltipStyle = {
  background: "#252820",
  border: "1px solid #42483a",
  borderRadius: 12,
  color: "#f6f8ef",
  fontSize: 12,
};

export default function Admin() {
  const { user, authLoaded, navigate, notify } = useApp();
  const [stats, setStats] = useState(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("overview"),
    [eventId, setEventId] = useState("electric-bloom"),
    [event, setEvent] = useState(null),
    [create, setCreate] = useState(false),
    [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await api("/admin/stats");
      setStats(d);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);
  const loadEvent = useCallback(async () => {
    try {
      setEvent(await api("/events/" + eventId));
    } catch (e) {
      setError(e.message);
    }
  }, [eventId]);
  useEffect(() => {
    if (user?.role !== "admin") return;
    load();
    const i = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10000);
    return () => clearInterval(i);
  }, [user?.role, load]);
  useEffect(() => {
    if (user?.role === "admin") loadEvent();
  }, [user?.role, loadEvent, stats?.serverTime]);
  if (!authLoaded)
    return (
      <div className="loading-area">
        <Spinner label="Opening the control room" />
      </div>
    );
  if (user?.role !== "admin")
    return (
      <div className="page-width">
        <Empty
          icon={ShieldCheck}
          title="For the people behind the night."
          action={
            <Button
              className="button-primary"
              onClick={() => navigate("/login?next=/admin")}
            >
              Organiser sign in
              <ArrowUpRight size={17} />
            </Button>
          }
        >
          The control room is available to authorised organisers. Sign in with
          your organiser account.
        </Empty>
      </div>
    );
  const refresh = async () => {
    setLoading(true);
    await Promise.all([load(), loadEvent()]);
    setLoading(false);
  };
  const selectedStats = stats?.events.find((e) => e.id === eventId);
  const hourly = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(stats?.serverTime || Date.now());
    date.setUTCMinutes(0, 0, 0);
    date.setUTCHours(date.getUTCHours() - 11 + i);
    const source = (stats?.eventTraffic || [])
      .filter((p) => p.event_id === eventId)
      .find((p) => new Date(p.hour).getTime() === date.getTime());
    return {
      time: date.toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }),
      visits: source?.visits || 0,
      bookings: source?.bookings || 0,
    };
  });
  return (
    <div className="admin-page page-width">
      <div className="admin-heading">
        <div>
          <Eyebrow>
            <span className="live-dot" /> ORGANISER CONTROL ROOM
          </Eyebrow>
          <h1>
            Behind every
            <br />
            <span className="muted-heading">great night.</span>
          </h1>
        </div>
        <div className="admin-heading-actions">
          <span className="live-label">
            <span className="live-dot" />
            Live records · updates every 10s
          </span>
          <Button
            className="button-outline button-small"
            onClick={refresh}
            loading={loading}
          >
            <RefreshCw size={15} />
            Refresh
          </Button>
          <Button
            className="button-primary button-small"
            onClick={() => setCreate(true)}
          >
            <Plus size={16} />
            Create event
          </Button>
        </div>
      </div>
      <div className="admin-toolbar">
        <div className="tabs">
          {[
            ["overview", "Overview", LayoutDashboard],
            ["inventory", "Seat control", Ticket],
            ["audience", "Audience", Users],
            ["gate", "Gate check", ScanLine],
          ].map(([id, title, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />
              {title}
            </button>
          ))}
        </div>
        <label className="event-selector">
          <span>EVENT</span>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {stats?.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!stats ? (
        <div className="loading-area">
          <Spinner label="Reading the room" />
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <div className="stats-grid">
                {[
                  {
                    label: "NET DEMO SALES",
                    value: money(stats.totals.revenue),
                    sub: "Confirmed bookings, minus cancellations",
                    icon: Wallet,
                  },
                  {
                    label: "CONFIRMED BOOKINGS",
                    value: stats.totals.bookings,
                    sub: `${stats.totals.checkins} tickets checked in`,
                    icon: Ticket,
                  },
                  {
                    label: "EVENT PAGE VISITS",
                    value: stats.totals.visits,
                    sub: `${stats.totals.online} active accounts in the last 5 min`,
                    icon: Eye,
                  },
                  {
                    label: "IN THE WAITING ROOM",
                    value: stats.totals.waiting,
                    sub: `${stats.totals.held} seats currently held`,
                    icon: Clock3,
                  },
                ].map(({ label, value, sub, icon: Icon }) => (
                  <article className="stat-card" key={label}>
                    <div className="row-between">
                      <span>{label}</span>
                      <Icon size={17} />
                    </div>
                    <strong>{value}</strong>
                    <small>{sub}</small>
                  </article>
                ))}
              </div>
              <div className="admin-chart-grid">
                <section className="dashboard-panel traffic-panel">
                  <div className="section-heading compact">
                    <div>
                      <Eyebrow>{selectedStats?.title}</Eyebrow>
                      <h2>The pulse of your event.</h2>
                    </div>
                    <Pill>LAST 12 HOURS</Pill>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i style={{ background: "#d5fd71" }} />
                      Page visits
                    </span>
                    <span>
                      <i style={{ background: "#8fc7db" }} />
                      Confirmed bookings
                    </span>
                  </div>
                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={hourly}
                        margin={{ top: 15, right: 12, left: -26, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="traffic-green"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0"
                              stopColor="#d5fd71"
                              stopOpacity={0.25}
                            />
                            <stop
                              offset="1"
                              stopColor="#d5fd71"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="#2d3128"
                          vertical={false}
                          strokeDasharray="3 5"
                        />
                        <XAxis
                          dataKey="time"
                          stroke="#919888"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10 }}
                          minTickGap={25}
                        />
                        <YAxis
                          allowDecimals={false}
                          stroke="#919888"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 10 }}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area
                          type="monotone"
                          dataKey="visits"
                          name="Page visits"
                          stroke="#d5fd71"
                          strokeWidth={2}
                          fill="url(#traffic-green)"
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="bookings"
                          name="Confirmed bookings"
                          stroke="#8fc7db"
                          strokeWidth={2}
                          fill="transparent"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="chart-footnote">
                    Actual recorded activity. A flat line means no activity in
                    that hour.
                  </p>
                </section>
                <section className="dashboard-panel occupancy-panel">
                  <Eyebrow>{selectedStats?.title}</Eyebrow>
                  <h2>Every spot, accounted for.</h2>
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={Object.keys(chartColors).map((key) => ({
                            name: labels[key],
                            value: selectedStats?.[key] || 0,
                            key,
                          }))}
                          dataKey="value"
                          innerRadius={66}
                          outerRadius={88}
                          paddingAngle={3}
                          stroke="none"
                          isAnimationActive={false}
                        >
                          {Object.entries(chartColors).map(([key, color]) => (
                            <Cell key={key} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-centre">
                      <strong>{selectedStats?.capacity || 0}</strong>
                      <span>TOTAL SEATS</span>
                    </div>
                  </div>
                  <div className="occupancy-legend">
                    {Object.entries(chartColors).map(([key, color]) => (
                      <div key={key}>
                        <span>
                          <i style={{ background: color }} />
                          {labels[key]}
                        </span>
                        <strong>{selectedStats?.[key] || 0}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="dashboard-panel">
                <div className="section-heading compact">
                  <div>
                    <Eyebrow>THE BIG PICTURE</Eyebrow>
                    <h2>Your nights at a glance.</h2>
                  </div>
                  <span className="muted-text">
                    {stats.events.length} published experiences
                  </span>
                </div>
                <div className="table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>EXPERIENCE</th>
                        <th>AVAILABLE</th>
                        <th>HELD</th>
                        <th>CONFIRMED</th>
                        <th>RESERVED</th>
                        <th>WAITING</th>
                        <th>SALES</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {stats.events.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <div className="table-event">
                              <img src={e.details.image} alt="" />
                              <div>
                                <strong>{e.title}</strong>
                                <small>{fullDate(e.details.date)}</small>
                              </div>
                            </div>
                          </td>
                          <td className="green-text">{e.available}</td>
                          <td>{e.held}</td>
                          <td>{e.booked}</td>
                          <td>{e.reserved}</td>
                          <td>{e.waiting}</td>
                          <td>{money(e.revenue)}</td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={"Manage " + e.title}
                              onClick={() => {
                                setEventId(e.id);
                                setTab("inventory");
                              }}
                            >
                              <ArrowUpRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="admin-bottom-grid">
                <section className="dashboard-panel">
                  <div className="section-heading compact">
                    <h2>What’s happening.</h2>
                    <Activity size={18} />
                  </div>
                  <div className="activity-list">
                    {stats.recent.length ? (
                      stats.recent.slice(0, 8).map((a) => (
                        <div className="activity-row" key={a.id}>
                          <span
                            className={
                              "activity-dot " +
                              (a.kind === "booking_confirmed"
                                ? "good"
                                : a.kind === "payment_failed"
                                  ? "bad"
                                  : "")
                            }
                          />
                          <div>
                            <strong>{activityLabels[a.kind] || a.kind}</strong>
                            <span>
                              {a.name || "A visitor"}
                              {a.title ? " · " + a.title : ""}
                            </span>
                          </div>
                          <small>{timeLabel(a.created_at)}</small>
                        </div>
                      ))
                    ) : (
                      <p className="muted-text">
                        Activity appears as people explore and book.
                      </p>
                    )}
                  </div>
                </section>
                <section className="dashboard-panel">
                  <div className="section-heading compact">
                    <h2>Keep the crowd fair.</h2>
                    <ShieldCheck size={19} />
                  </div>
                  <div className="admin-signup-stat">
                    <strong>{stats.totals.users}</strong>
                    <div>
                      <span>registered fans</span>
                      <small>
                        {stats.totals.signups} joined in the last 24 hours
                      </small>
                    </div>
                    <Users size={33} />
                  </div>
                  {stats.alerts.length ? (
                    <div className="risk-alert">
                      <AlertTriangle size={19} />
                      <div>
                        <strong>
                          {stats.alerts.length} accounts need a closer look
                        </strong>
                        <p>
                          Repeated holds, queue changes, or payment failures.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="risk-clear">
                      <Check size={21} />
                      <div>
                        <strong>No unusual patterns right now.</strong>
                        <p>
                          We watch repeated expired holds, rapid queue changes,
                          and payment failures.
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    className="text-link"
                    onClick={() => setTab("audience")}
                  >
                    View audience & signals
                    <ArrowUpRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {tab === "inventory" && (
            <>
              <section className="dashboard-panel inventory-heading">
                <div>
                  <Eyebrow>THE SEATS BEHIND THE SCENES</Eyebrow>
                  <h2>{selectedStats?.title}</h2>
                  <p>
                    Manage guest lists, production allocations, and seats
                    released back to fans. Customer holds and confirmed tickets
                    stay protected.
                  </p>
                </div>
                <Button
                  className="button-outline"
                  onClick={() => navigate("/event/" + eventId)}
                >
                  View public booking
                  <ArrowUpRight size={17} />
                </Button>
              </section>
              {event ? (
                <>
                  <div className="inventory-class-grid">
                    {event.classes.map((c) => (
                      <article className="dashboard-panel" key={c.id}>
                        <div className="row-between">
                          <Pill style={{ color: c.color }}>{c.label}</Pill>
                          <strong>{money(c.price)}</strong>
                        </div>
                        <h2>{c.name}</h2>
                        <div className="inventory-counts">
                          <div>
                            <strong>{c.available}</strong>
                            <span>Available</span>
                          </div>
                          <div>
                            <strong>{c.held}</strong>
                            <span>Held</span>
                          </div>
                          <div>
                            <strong>{c.booked}</strong>
                            <span>Booked</span>
                          </div>
                          <div>
                            <strong>{c.reserved}</strong>
                            <span>Reserved</span>
                          </div>
                        </div>
                        <div className="inventory-meter">
                          {Object.entries(chartColors).map(([key, color]) => (
                            <span
                              key={key}
                              style={{
                                background: color,
                                width: (c[key] / c.capacity) * 100 + "%",
                              }}
                            />
                          ))}
                        </div>
                        <InventoryForm
                          eventId={eventId}
                          cls={c}
                          onDone={refresh}
                        />
                      </article>
                    ))}
                  </div>
                  <section className="dashboard-panel">
                    <div className="section-heading compact">
                      <div>
                        <Eyebrow>CLASS-BY-CLASS</Eyebrow>
                        <h2>Capacity, clearly.</h2>
                      </div>
                      <span className="muted-text">{event.title}</span>
                    </div>
                    <div className="chart-container">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={event.classes.map((c) => ({
                            name: c.label,
                            ...c,
                          }))}
                          margin={{ left: -20, right: 10, bottom: 5, top: 15 }}
                        >
                          <CartesianGrid stroke="#2d3128" vertical={false} />
                          <XAxis
                            dataKey="label"
                            stroke="#919888"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis
                            stroke="#919888"
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip contentStyle={tooltipStyle} />
                          {Object.entries(chartColors).map(([key, color]) => (
                            <Bar
                              key={key}
                              dataKey={key}
                              name={labels[key]}
                              fill={color}
                              stackId="seats"
                              maxBarSize={70}
                              isAnimationActive={false}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-legend">
                      {Object.entries(chartColors).map(([key, color]) => (
                        <span key={key}>
                          <i style={{ background: color }} />
                          {labels[key]}
                        </span>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <Spinner label="Loading seat inventory" />
              )}
            </>
          )}
          {tab === "audience" && (
            <>
              <div className="audience-summary">
                <div className="stat-card">
                  <span>REGISTERED FANS</span>
                  <strong>{stats.totals.users}</strong>
                  <small>Accounts stored in the shared database</small>
                </div>
                <div className="stat-card">
                  <span>NEW IN THE LAST 24H</span>
                  <strong>{stats.totals.signups}</strong>
                  <small>Signups, including fresh demo accounts</small>
                </div>
                <div className="stat-card">
                  <span>ACCOUNTS WITH SIGNALS</span>
                  <strong>{stats.alerts.length}</strong>
                  <small>Review signals, not confirmed fraud</small>
                </div>
              </div>
              <section className="dashboard-panel">
                <div className="section-heading compact">
                  <h2>The people making plans.</h2>
                  <span className="muted-text">
                    Latest {stats.users.length} accounts
                  </span>
                </div>
                <div className="table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>FAN</th>
                        <th>EMAIL</th>
                        <th>DEMO BALANCE</th>
                        <th>BOOKINGS</th>
                        <th>JOINED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="table-person">
                              <span className="small-avatar">
                                {u.name.charAt(0)}
                              </span>
                              <strong>{u.name}</strong>
                            </div>
                          </td>
                          <td>{u.email}</td>
                          <td>{money(u.wallet)}</td>
                          <td>{u.bookings}</td>
                          <td>{fullDate(u.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!stats.users.length && (
                  <p className="muted-text">
                    Signups will appear here as soon as fans join.
                  </p>
                )}
              </section>
              <section className="dashboard-panel">
                <div className="section-heading compact">
                  <div>
                    <Eyebrow>TRANSPARENT RULES</Eyebrow>
                    <h2>Booking signals.</h2>
                  </div>
                  <ShieldCheck size={21} />
                </div>
                <p className="panel-description">
                  Accounts are flagged after 3 expired holds, 8 queue joins, or
                  3 failed payments within an hour. Frequent queue changes also
                  trigger a booking cooldown. Signals are visible for review;
                  they do not establish fraud.
                </p>
                {stats.alerts.length ? (
                  <div className="table-scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>ACCOUNT</th>
                          <th>EXPIRED HOLDS</th>
                          <th>QUEUE JOINS</th>
                          <th>FAILED PAYMENTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.alerts.map((a) => (
                          <tr key={a.user_id}>
                            <td>
                              <strong>{a.name}</strong>
                              <small className="block-muted">{a.email}</small>
                            </td>
                            <td>{a.expirations}</td>
                            <td>{a.queue_changes}</td>
                            <td>{a.failures}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="risk-clear">
                    <Check size={21} />
                    <span>No accounts meet the review thresholds.</span>
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "gate" && (
            <GateScanner
              eventId={eventId}
              title={selectedStats?.title}
              onScan={load}
            />
          )}
        </>
      )}
      {create && (
        <CreateEventModal
          onClose={() => setCreate(false)}
          onCreated={async (id) => {
            setCreate(false);
            await load();
            setEventId(id);
            setTab("inventory");
            notify("Your event is live and ready for bookings.");
          }}
        />
      )}
    </div>
  );
}

function InventoryForm({ eventId, cls, onDone }) {
  const { notify } = useApp();
  const [quantity, setQuantity] = useState(5),
    [reason, setReason] = useState("Guest list"),
    [busy, setBusy] = useState("");
  const submit = async (action) => {
    setBusy(action);
    try {
      await api("/admin/inventory", {
        eventId,
        classId: cls.id,
        quantity: Number(quantity),
        reason,
        action,
      });
      notify(
        action === "reserve"
          ? "Seats allocated to your guest list."
          : "Seats released. Waiting fans are being admitted.",
      );
      await onDone();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="inventory-form">
      <label>
        NUMBER OF SEATS
        <input
          type="number"
          min={1}
          max={cls.capacity}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>
      <label>
        ALLOCATION NOTE
        <input
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Guest list / production"
        />
      </label>
      <div className="inventory-form-actions">
        <Button
          className="button-primary button-small"
          onClick={() => submit("reserve")}
          loading={busy === "reserve"}
          disabled={!!busy || !cls.admissible}
        >
          <LockKeyhole size={14} />
          Reserve
        </Button>
        <Button
          className="button-outline button-small"
          onClick={() => submit("release")}
          loading={busy === "release"}
          disabled={!!busy || !cls.reserved}
        >
          <Unlock size={14} />
          Release
        </Button>
      </div>
      <p className="small-note">
        {cls.admissible} seats can be reserved without taking capacity promised
        to admitted fans.
      </p>
    </div>
  );
}

function GateScanner({ eventId, title, onScan }) {
  const [token, setToken] = useState(""),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false);
  const video = useRef(null),
    stream = useRef(null),
    file = useRef(null),
    checking = useRef(false);
  const verify = useCallback(
    async (value) => {
      if (checking.current) return;
      checking.current = true;
      setBusy(true);
      setResult(null);
      setError("");
      try {
        const d = await api("/admin/scan", { token: value, eventId });
        setResult(d);
        onScan();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
        checking.current = false;
      }
    },
    [eventId, onScan],
  );
  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
  };
  useEffect(() => {
    let interval;
    let cancelled = false;
    if (camera) {
      (async () => {
        try {
          const media = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          });
          if (cancelled) {
            media.getTracks().forEach((t) => t.stop());
            return;
          }
          stream.current = media;
          video.current.srcObject = media;
          await video.current.play();
          const { default: jsQR } = await import("jsqr");
          const canvas = document.createElement("canvas"),
            ctx = canvas.getContext("2d", { willReadFrequently: true });
          interval = setInterval(() => {
            if (!video.current?.videoWidth) return;
            canvas.width = video.current.videoWidth;
            canvas.height = video.current.videoHeight;
            ctx.drawImage(video.current, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(pixels.data, canvas.width, canvas.height);
            if (code) {
              setToken(code.data);
              stop();
              verify(code.data);
            }
          }, 500);
        } catch {
          setError(
            "Camera unavailable or permission was declined. Upload a QR image or paste the verification code.",
          );
          stop();
        }
      })();
    }
    return () => {
      cancelled = true;
      clearInterval(interval);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [camera, verify]);
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    try {
      if (f.size > 10 * 1024 * 1024)
        throw new Error("Choose an image smaller than 10 MB.");
      const image = await createImageBitmap(f);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      image.close();
      const { default: jsQR } = await import("jsqr");
      const code = jsQR(pixels.data, canvas.width, canvas.height);
      if (!code)
        throw new Error(
          "No QR code found. Try the original saved ticket image.",
        );
      setToken(code.data);
      await verify(code.data);
    } catch (e) {
      setError(e.message);
    } finally {
      e.target.value = "";
    }
  };
  return (
    <div className="gate-layout">
      <section className="dashboard-panel scanner-panel">
        <Eyebrow>ONE TICKET. ONE ENTRY.</Eyebrow>
        <h2>Good evening. You’re in.</h2>
        <p className="panel-description">
          Verify entry for <strong>{title}</strong>. A successful scan
          immediately marks the ticket as used across all devices.
        </p>
        {camera ? (
          <div className="camera-preview">
            <video ref={video} muted playsInline />
            <button className="button button-outline" onClick={stop}>
              <X size={15} />
              Stop camera
            </button>
          </div>
        ) : (
          <div className="scanner-placeholder">
            <div className="scan-frame">
              <ScanLine size={65} />
            </div>
            <span>POINT. SCAN. WELCOME THEM IN.</span>
          </div>
        )}
        <div className="scanner-actions">
          <Button
            className="button-primary"
            onClick={() => setCamera(true)}
            disabled={camera}
          >
            <Camera size={17} />
            Open camera
          </Button>
          <Button
            className="button-outline"
            onClick={() => file.current.click()}
          >
            <ImagePlus size={17} />
            Upload QR image
          </Button>
          <input
            type="file"
            accept="image/*"
            ref={file}
            hidden
            onChange={upload}
          />
        </div>
        <div className="divider-label">
          <span />
          OR USE THE TICKET CODE
          <span />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify(token);
          }}
        >
          <label className="field-label">
            VERIFICATION CODE
            <textarea
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste SW1.… from the ticket wallet"
              rows={3}
            />
          </label>
          <Button
            className="button-primary full-width"
            type="submit"
            loading={busy}
          >
            Verify & admit
            <ArrowRight size={17} />
          </Button>
        </form>
      </section>
      <section className="scanner-result-wrap">
        {result ? (
          <div className="scan-result success">
            <div>
              <Check size={38} />
            </div>
            <Eyebrow>ENTRY APPROVED</Eyebrow>
            <h2>Welcome, {result.name}.</h2>
            <p>{result.event}</p>
            <strong>SEAT {result.seat}</strong>
            <span>{result.reference}</span>
            <p className="small-note">
              Ticket marked as checked in. Another scan will be rejected.
            </p>
          </div>
        ) : error ? (
          <div className="scan-result error">
            <div>
              <AlertTriangle size={35} />
            </div>
            <Eyebrow>DO NOT ADMIT</Eyebrow>
            <h2>Let’s check that ticket.</h2>
            <p>{error}</p>
            <Button
              className="button-outline"
              onClick={() => {
                setError("");
                setToken("");
              }}
            >
              Check another ticket
            </Button>
          </div>
        ) : (
          <div className="scan-result idle">
            <ShieldCheck size={45} />
            <h2>Ready when they are.</h2>
            <p>
              Valid, cancelled, and previously used tickets get clear results
              here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function CreateEventModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
      title: "",
      artist: "",
      venue: "",
      date: "",
      category: "Live music",
      basePrice: 799,
      description: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/admin/events", {
        ...form,
        date: new Date(form.date).toISOString(),
      });
      await onCreated(d.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Put a new night on the map." onClose={onClose}>
      <form className="create-event-form" onSubmit={submit}>
        <label>
          EVENT NAME
          <input
            required
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            minLength={3}
            maxLength={80}
            placeholder="Give it a good name"
          />
        </label>
        <label>
          TAGLINE
          <input
            value={form.artist}
            onChange={(e) => update("artist", e.target.value)}
            maxLength={100}
            placeholder="One line that sets the feeling"
          />
        </label>
        <div className="form-two-col">
          <label>
            VENUE
            <input
              required
              value={form.venue}
              onChange={(e) => update("venue", e.target.value)}
              maxLength={80}
              placeholder="Where’s it happening?"
            />
          </label>
          <label>
            CATEGORY
            <select
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
            >
              {["Live music", "Electronic", "Indie", "Comedy", "Theatre"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="form-two-col">
          <label>
            SHOW DATE & TIME (YOUR TIMEZONE)
            <input
              required
              type="datetime-local"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </label>
          <label>
            SILVER STARTING PRICE (₹)
            <input
              type="number"
              required
              min={100}
              max={25000}
              value={form.basePrice}
              onChange={(e) => update("basePrice", e.target.value)}
            />
          </label>
        </div>
        <label>
          ABOUT THE EXPERIENCE
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={3}
            maxLength={1000}
          />
        </label>
        <p className="small-note">
          Creates the standard three-class venue. Gold is 1.6× and VIP is 2.5×
          the starting price. All seats begin available.
        </p>
        <ErrorBox>{error}</ErrorBox>
        <Button
          className="button-primary full-width"
          type="submit"
          loading={busy}
        >
          Publish experience
          <ArrowUpRight size={17} />
        </Button>
      </form>
    </Modal>
  );
}
