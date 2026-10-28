"use client";
import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  Wallet,
  Ticket,
  CalendarDays,
  MapPin,
  Check,
  Download,
  Copy,
  X,
  Clock3,
  Users,
  ScanLine,
  LockKeyhole,
  Sparkles,
  RefreshCcw,
  Asterisk,
} from "lucide-react";
import {
  api,
  useApp,
  money,
  fullDate,
  dateLabel,
  timeLabel,
  Button,
  Eyebrow,
  Pill,
  Modal,
  Empty,
  ErrorBox,
  Spinner,
} from "./ui.jsx";

export function AuthScreen({ signup = false }) {
  const { setUser, navigate, notify, path, user } = useApp();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const next = new URLSearchParams(path.split("?")[1] || "").get("next") || "/";
  const goNext = () =>
    navigate(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  const submit = async (e, demo = false) => {
    e?.preventDefault();
    setError("");
    setBusy(demo ? "demo" : "form");
    try {
      const d = await api(
        "/auth/" + (demo ? "demo" : signup ? "signup" : "login"),
        { name, email, password },
      );
      setUser(d.user);
      notify(
        demo
          ? `${money(d.user.wallet)} in demo funds. Your next night is on us.`
          : `Welcome ${signup ? "to SeatWise, " : "back, "}${d.user.name.split(" ")[0]}.`,
      );
      goNext();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="auth-page page-width">
      <button className="back-link" onClick={() => navigate("/")}>
        <ArrowLeft size={16} />
        Back to the good stuff
      </button>
      <div className="auth-layout">
        <div
          className="auth-visual"
          style={{ backgroundImage: "url('/images/afterhours.jpg')" }}
        >
          <div className="auth-visual-top">
            <Asterisk size={38} />
            <span>
              OFFLINE IS
              <br />A GOOD LOOK.
            </span>
          </div>
          <div className="auth-visual-copy">
            <Eyebrow>YOUR NEXT CORE MEMORY</Eyebrow>
            <h1>
              It starts
              <br />
              with being
              <br />
              <em>there.</em>
            </h1>
            <p>
              The music. The lights. The people.
              <br />
              Let’s find your next favourite night.
            </p>
          </div>
          <div className="auth-visual-bottom">
            <span className="live-dot" /> GOOD PEOPLE. GREAT NIGHTS.
          </div>
        </div>
        <section className="auth-form-wrap">
          <Eyebrow>
            {next === "/admin"
              ? "FOR THE PEOPLE BEHIND THE NIGHT"
              : "YOU’RE ON THE LIST"}
          </Eyebrow>
          <h2>
            {signup
              ? "Meet your next night."
              : next === "/admin"
                ? "Welcome, organiser."
                : "Hey, good to see you."}
          </h2>
          <p>
            {signup
              ? "Create an account. We’ll add a random demo wallet balance so you can try the whole experience."
              : "Sign in and get back to making plans."}
          </p>
          {user ? (
            <div className="auth-already">
              <p>
                Already signed in as <strong>{user.name}</strong>.
              </p>
              <Button className="button-primary" onClick={goNext}>
                Continue
                <ArrowRight size={17} />
              </Button>
              <button
                className="subtle-button"
                onClick={async () => {
                  try {
                    await api("/auth/logout", {});
                    setUser(null);
                  } catch (error) {
                    setError(error.message);
                  }
                }}
              >
                Sign in with another account
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={submit} className="auth-form">
                {signup && (
                  <label>
                    YOUR NAME
                    <input
                      autoComplete="name"
                      placeholder="What should we call you?"
                      required
                      minLength={2}
                      maxLength={60}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  EMAIL ADDRESS
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder={
                      next === "/admin"
                        ? "Organiser email"
                        : "you@somewhere.com"
                    }
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  PASSWORD
                  <div className="password-field">
                    <input
                      type={show ? "text" : "password"}
                      autoComplete={
                        signup ? "new-password" : "current-password"
                      }
                      placeholder={
                        signup
                          ? "At least 8 characters"
                          : "Your secret handshake"
                      }
                      required
                      minLength={8}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={show ? "Hide password" : "Show password"}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                <ErrorBox>{error}</ErrorBox>
                <Button
                  type="submit"
                  className="button-primary full-width"
                  loading={busy === "form"}
                  disabled={!!busy}
                >
                  {signup ? "Create my account" : "Let me in"}
                  <ArrowUpRight size={18} />
                </Button>
              </form>
              {next !== "/admin" && (
                <>
                  <div className="divider-label">
                    <span />
                    OR SKIP THE INTRO
                    <span />
                  </div>
                  <Button
                    className="button-outline full-width"
                    onClick={(e) => submit(e, true)}
                    loading={busy === "demo"}
                    disabled={!!busy}
                  >
                    <Sparkles size={17} />
                    Try a fresh demo account
                  </Button>
                  <div className="demo-note">
                    <Wallet size={15} />
                    <span>
                      A random ₹9,000–₹18,000 demo wallet. No real money.
                    </span>
                  </div>
                  <p className="auth-switch">
                    {signup ? "Already part of the crowd?" : "First time here?"}{" "}
                    <button
                      onClick={() => {
                        setError("");
                        navigate(
                          (signup ? "/login" : "/signup") +
                            (next !== "/"
                              ? "?next=" + encodeURIComponent(next)
                              : ""),
                        );
                      }}
                    >
                      {signup ? "Sign in" : "Join SeatWise"}
                      <ArrowUpRight size={13} />
                    </button>
                  </p>
                </>
              )}
            </>
          )}
          <div className="auth-security">
            <ShieldCheck size={15} />
            Your account. Your tickets. Your own space.
          </div>
        </section>
      </div>
    </div>
  );
}

export function TicketsScreen() {
  const { user, authLoaded, navigate, refreshUser, notify } = useApp();
  const [bookings, setBookings] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [view, setView] = useState(null),
    [cancel, setCancel] = useState(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("Upcoming");
  const load = useCallback(
    () =>
      api("/bookings")
        .then((d) => setBookings(d.bookings))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    if (user) load();
    else if (authLoaded) setLoading(false);
  }, [user, authLoaded, load]);
  const cancelNow = async () => {
    setBusy(true);
    try {
      const r = await api("/bookings/" + cancel.id + "/cancel", {});
      notify(r.message);
      setCancel(null);
      await Promise.all([load(), refreshUser()]);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  if (authLoaded && !user)
    return (
      <div className="page-width">
        <Empty
          icon={Ticket}
          title="Your next night is waiting."
          action={
            <Button
              className="button-primary"
              onClick={() => navigate("/login?next=/tickets")}
            >
              Sign in to see your tickets
              <ArrowUpRight size={17} />
            </Button>
          }
        >
          All your plans, tickets, and unforgettable nights in one place.
        </Empty>
      </div>
    );
  const filtered = bookings.filter((b) =>
    filter === "Cancelled"
      ? b.state === "cancelled"
      : filter === "Past"
        ? b.state === "confirmed" && new Date(b.details.date) < new Date()
        : b.state === "confirmed" && new Date(b.details.date) >= new Date(),
  );
  return (
    <div className="page-width standard-page">
      <Eyebrow>THE PLANS ARE OFFICIAL</Eyebrow>
      <div className="section-heading">
        <div>
          <h1>
            Your tickets.
            <br />
            <span className="muted-heading">Your next stories.</span>
          </h1>
        </div>
        <Ticket className="page-heading-icon" size={65} />
      </div>
      <div className="tabs">
        {["Upcoming", "Past", "Cancelled"].map((t) => (
          <button
            className={filter === t ? "active" : ""}
            onClick={() => setFilter(t)}
            key={t}
          >
            {t}
            <span>
              {
                bookings.filter((b) =>
                  t === "Cancelled"
                    ? b.state === "cancelled"
                    : t === "Past"
                      ? b.state === "confirmed" &&
                        new Date(b.details.date) < new Date()
                      : b.state === "confirmed" &&
                        new Date(b.details.date) >= new Date(),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {loading ? (
        <div className="loading-area">
          <Spinner label="Finding your tickets" />
        </div>
      ) : !filtered.length ? (
        <Empty
          icon={Ticket}
          title={
            filter === "Upcoming"
              ? "Your calendar deserves better."
              : "Nothing here yet."
          }
          action={
            <Button className="button-primary" onClick={() => navigate("/")}>
              Find an experience
              <ArrowUpRight size={17} />
            </Button>
          }
        >
          {filter === "Upcoming"
            ? "Your next “I was there” moment is a few clicks away."
            : "Your booking history will appear here."}
        </Empty>
      ) : (
        <div className="booking-list">
          {filtered.map((b) => (
            <article
              className={
                "booking-ticket " + (b.state === "cancelled" ? "cancelled" : "")
              }
              key={b.id}
            >
              <img src={b.details.image} alt="" />
              <div className="booking-ticket-body">
                <div className="row-between">
                  <Pill
                    className={
                      b.state === "confirmed" ? "pill-green" : "pill-muted"
                    }
                  >
                    {b.state === "confirmed" ? "YOU’RE GOING" : "CANCELLED"}
                  </Pill>
                  <small>{b.reference}</small>
                </div>
                <h2>{b.title}</h2>
                <p>
                  <CalendarDays size={15} />
                  {fullDate(b.details.date)} · {timeLabel(b.details.date)}
                </p>
                <p>
                  <MapPin size={15} />
                  {b.details.venue}, {b.details.city}
                </p>
                <div className="ticket-detail-row">
                  <span>
                    {b.tickets.length}{" "}
                    {b.tickets.length === 1 ? "ticket" : "tickets"}
                  </span>
                  <span>{b.tickets.map((t) => t.seat_id).join(", ")}</span>
                  <strong>{money(b.total)}</strong>
                </div>
              </div>
              <div className="booking-ticket-actions">
                {b.state === "confirmed" ? (
                  <>
                    <Button
                      className="button-primary"
                      onClick={() => setView(b)}
                    >
                      <ScanLine size={17} />
                      View tickets
                    </Button>
                    <button
                      className="subtle-button"
                      onClick={() => setCancel(b)}
                    >
                      Cancel booking
                    </button>
                  </>
                ) : (
                  <span className="refund-label">
                    <RefreshCcw size={16} />
                    Refunded to wallet
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {view && <TicketModal booking={view} onClose={() => setView(null)} />}
      {cancel && (
        <Modal title="Can’t make it?" onClose={() => setCancel(null)}>
          <p className="modal-description">
            Cancel all {cancel.tickets.length} ticket(s) for{" "}
            <strong>{cancel.title}</strong>? Your seats will be released and{" "}
            {money(cancel.total)} will return to your demo wallet.
          </p>
          <p className="small-note">
            Cancellations close two hours before the show. Checked-in tickets
            cannot be cancelled.
          </p>
          <div className="modal-actions">
            <Button className="button-outline" onClick={() => setCancel(null)}>
              Keep my plans
            </Button>
            <Button
              className="button-danger"
              onClick={cancelNow}
              loading={busy}
            >
              Cancel & refund
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TicketModal({ booking, onClose }) {
  const { notify } = useApp();
  const [index, setIndex] = useState(0),
    [qr, setQr] = useState("");
  const ticket = booking.tickets[index];
  useEffect(() => {
    setQr("");
    QRCode.toDataURL(ticket.token, {
      width: 330,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then(setQr)
      .catch(() => {});
  }, [ticket.token]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticket.token);
      notify(
        "Verification code copied. Only share it with the organiser at entry.",
      );
    } catch {
      notify("Clipboard unavailable in this browser.", "error");
    }
  };
  return (
    <Modal title="Your way in." onClose={onClose}>
      <div className="qr-ticket">
        <div className="qr-ticket-heading">
          <Pill className="pill-green">ADMIT ONE</Pill>
          <h2>{booking.title}</h2>
          <p>
            {dateLabel(booking.details.date)} ·{" "}
            {timeLabel(booking.details.date)} · {booking.details.venue}
          </p>
        </div>
        <div className="qr-code">
          {qr ? (
            <img src={qr} alt={`Entry QR for seat ${ticket.seat_id}`} />
          ) : (
            <Spinner label="Preparing your QR" />
          )}
        </div>
        <div className="qr-seat">
          <div>
            <small>SECTION</small>
            <strong>{ticket.class_name}</strong>
          </div>
          <div>
            <small>SEAT</small>
            <strong>{ticket.seat_id}</strong>
          </div>
        </div>
        <p className="qr-reference">
          {booking.reference} ·{" "}
          {ticket.checked_in_at
            ? "ALREADY CHECKED IN"
            : "SHOW THIS AT THE DOOR"}
        </p>
      </div>
      {booking.tickets.length > 1 && (
        <div className="ticket-selector">
          {booking.tickets.map((t, i) => (
            <button
              key={t.id}
              className={index === i ? "active" : ""}
              onClick={() => setIndex(i)}
            >
              Seat {t.seat_id}
            </button>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button className="button button-outline" onClick={copy}>
          <Copy size={16} />
          Copy verification code
        </button>
        {qr && (
          <a
            className="button button-primary"
            href={qr}
            download={`SeatWise-${booking.reference}-${ticket.seat_id}.png`}
          >
            <Download size={16} />
            Save QR
          </a>
        )}
      </div>
      <p className="small-note">
        Each ticket allows one entry. A copied QR cannot be used again after
        check-in.
      </p>
    </Modal>
  );
}

export function WalletScreen() {
  const { user, authLoaded, navigate } = useApp();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      api("/wallet")
        .then(setData)
        .catch((e) => setError(e.message));
  }, [user]);
  if (authLoaded && !user)
    return (
      <div className="page-width">
        <Empty
          icon={Wallet}
          title="A little credit. A lot of possibility."
          action={
            <Button
              className="button-primary"
              onClick={() => navigate("/login?next=/wallet")}
            >
              Sign in
              <ArrowUpRight size={17} />
            </Button>
          }
        >
          Every new account gets a random demo balance to try booking.
        </Empty>
      </div>
    );
  return (
    <div className="page-width standard-page wallet-page">
      <Eyebrow>YOUR NIGHT-OUT FUND</Eyebrow>
      <h1>
        Good times.
        <br />
        <span className="muted-heading">Already budgeted.</span>
      </h1>
      <div className="wallet-layout">
        <section className="balance-card">
          <div className="row-between">
            <Wallet size={25} />
            <Pill>DEMO WALLET</Pill>
          </div>
          <span>AVAILABLE BALANCE</span>
          <strong>{money(data?.balance ?? user?.wallet)}</strong>
          <p>Yours to spend on a night worth remembering.</p>
          <div className="balance-card-bottom">
            <span>{user?.name}</span>
            <span>SEATWISE / INR</span>
          </div>
        </section>
        <div className="wallet-explainer">
          <ShieldCheck size={27} />
          <h2>
            Try the real flow.
            <br />
            With demo funds.
          </h2>
          <p>
            Your welcome balance is randomly assigned when you join. Successful
            bookings deduct the actual ticket total. Eligible cancellations
            return it here.
          </p>
          <Button className="button-outline" onClick={() => navigate("/")}>
            Put it to good use
            <ArrowUpRight size={17} />
          </Button>
        </div>
      </div>
      <div className="section-heading compact">
        <h2>The money trail</h2>
        <span className="muted-text">Every debit. Every refund.</span>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!data ? (
        <div className="loading-area">
          <Spinner label="Loading your wallet" />
        </div>
      ) : (
        <div className="ledger-list">
          {data.ledger.map((entry) => (
            <div className="ledger-row" key={entry.id}>
              <div
                className={"ledger-icon " + (entry.amount > 0 ? "credit" : "")}
              >
                {entry.amount > 0 ? (
                  <ArrowLeft size={20} />
                ) : (
                  <Ticket size={20} />
                )}
              </div>
              <div>
                <strong>{entry.kind}</strong>
                <small>
                  {fullDate(entry.created_at)} · {timeLabel(entry.created_at)}
                </small>
              </div>
              <strong className={entry.amount > 0 ? "credit-text" : ""}>
                {entry.amount > 0 ? "+" : "−"}
                {money(Math.abs(entry.amount))}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HowScreen() {
  const { navigate } = useApp();
  const items = [
    {
      icon: Users,
      n: "01",
      title: "Your place in line stays yours.",
      text: "Each ticket class has its own queue. If there is enough capacity for your group, you get a two-minute seat-selection window. Otherwise, keep the waiting room open. We’ll let you in when space opens.",
    },
    {
      icon: LockKeyhole,
      n: "02",
      title: "Pick a seat. It’s held for you.",
      text: "Selecting your first seat starts a five-minute hold. Other fans cannot take those seats. Refreshing does not reset your timer. Auto-pick reserves random seats in your class and locks that selection.",
    },
    {
      icon: Wallet,
      n: "03",
      title: "Make it official.",
      text: "Pay with your demo wallet. A successful payment confirms your tickets. A failed or timed-out mock payment releases the seats without deducting funds. Retrying a processed payment does not charge twice.",
    },
    {
      icon: ScanLine,
      n: "04",
      title: "Show up. Scan in. Be there.",
      text: "Your QR ticket is checked against your booking at the door. Cancelled tickets are invalid, and each ticket can only be checked in once—even when two scanners try at the same time.",
    },
  ];
  return (
    <div className="page-width standard-page how-page">
      <Eyebrow>GOOD ENERGY. CLEAR RULES.</Eyebrow>
      <h1>
        Less booking drama.
        <br />
        <span className="heading-accent">More being there.</span>
      </h1>
      <p className="lead-text">
        A fair shot at a great night. Here’s how we make it happen.
      </p>
      <div className="how-grid">
        {items.map(({ icon: Icon, n, title, text }) => (
          <article key={n}>
            <div className="row-between">
              <span className="how-icon">
                <Icon size={25} />
              </span>
              <span className="how-number">{n}</span>
            </div>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="rules-banner">
        <ShieldCheck size={28} />
        <div>
          <h3>A few things that keep it fair.</h3>
          <p>
            Four tickets per person per event. One active booking session per
            event. No extending holds by refreshing. Repeated queue changes can
            trigger a cooldown. Cancellations close two hours before showtime.
          </p>
        </div>
      </div>
      <Button className="button-primary" onClick={() => navigate("/")}>
        Find your next night
        <ArrowUpRight size={18} />
      </Button>
    </div>
  );
}
