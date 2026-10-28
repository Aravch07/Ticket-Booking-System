"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import LaunchRoom from './LaunchRoom.jsx';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowRight,
  MapPin,
  CalendarDays,
  Clock3,
  ShieldCheck,
  Check,
  Plus,
  Minus,
  Shuffle,
  LockKeyhole,
  Ticket,
  Users,
  Headphones,
  ChevronRight,
  Wallet,
  X,
  RefreshCw,
  Volume2,
  DoorOpen,
  ZoomIn,
  ZoomOut,
  Info,
  CheckCircle2,
  LoaderCircle,
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
  ErrorBox,
  Spinner,
  Countdown,
} from "./ui.jsx";

export default function Booking({ id }) {
  const { user, navigate, notify, refreshUser } = useApp();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [pollError, setPollError] = useState(""),
    [busy, setBusy] = useState(""),
    [chosen, setChosen] = useState("silver"),
    [quantity, setQuantity] = useState(1),
    [checkoutOpen, setCheckoutOpen] = useState(false),
    [confirmed, setConfirmed] = useState(null),
    [outcome, setOutcome] = useState("success"),
    [zoom, setZoom] = useState(1),
    [hover, setHover] = useState(null);
  const paymentKey = useRef(null),
    paying = useRef(false),
    lastQueue = useRef(null),
    lastHold = useRef(null),
    mounted = useRef(true),
    activeId = useRef(id),
    pollPending = useRef(false);
  const launchJoining = useRef(false), lastLaunch = useRef(null);
  activeId.current = id;
  const apply = useCallback((next) => {
    if (!mounted.current || next.id !== activeId.current) return;
    setData((prev) =>
      !prev || new Date(next.serverTime) >= new Date(prev.serverTime)
        ? next
        : prev,
    );
    setPollError("");
  }, []);
  const refresh = useCallback(
    async (track = false) => {
      if (pollPending.current) return;
      pollPending.current = true;
      try {
        const d = await api(
          "/events/" + id + (track === true ? "?track=1" : ""),
        );
        apply(d);
        setError("");
        return d;
      } catch (e) {
        if (!data) setError(e.message);
        else setPollError("Live updates paused. Reconnecting…");
      } finally {
        pollPending.current = false;
      }
    },
    [id, apply, !!data],
  );
  useEffect(() => {
    mounted.current = true;
    setData(null);
    setError("");
    lastQueue.current = null;
    lastHold.current = null;
    api("/events/" + id + "?track=1")
      .then(apply)
      .catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
    };
  }, [id, apply]);
  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 3000);
    const wake = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [!!data, refresh]);
  useEffect(() => {
    if (!data) return;
    const current = data.queue?.state;
    if (lastQueue.current === "waiting" && current === "admitted")
      notify("Your turn! Your class has space. Pick your seats.");
    if (lastHold.current && !data.hold && !paying.current && !confirmed) {
      setCheckoutOpen(false);
      notify("Your seat hold ended. Rejoin the queue to try again.", "error");
    }
    lastQueue.current = current;
    lastHold.current = data.hold?.id || null;
    if (data.queue) {
      setChosen(data.queue.classId);
      setQuantity(data.queue.quantity);
    } else if (!data.classes.some(c => c.id === chosen)) {
      setChosen(data.classes[0]?.id || 'silver');
    }
  }, [data, notify, confirmed]);
  const perform = async (action, body = {}, label = action) => {
    if (busy) return;
    setBusy(label);
    try {
      const next = await api("/events/" + id + "/" + action, body);
      apply(next);
      return next;
    } catch (e) {
      notify(e.message, "error");
      await refresh();
    } finally {
      setBusy("");
    }
  };
  const join = async () => {
    if (!user) {
      navigate("/login?next=" + encodeURIComponent("/event/" + id));
      return;
    }
    const next = await perform("join", { classId: chosen, quantity }, "join");
    if (next)
      setTimeout(
        () =>
          document
            .getElementById("seat-selection")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
  };
  const joinLaunch = async () => {
    if (!user) return navigate('/login?next=' + encodeURIComponent('/event/' + id));
    return perform('launch', {}, 'launch');
  };
  const pick = async (seat) => {
    if (
      !user ||
      !data.queue ||
      !["admitted", "holding"].includes(data.queue.state)
    )
      return;
    if (data.hold?.mode === "auto") {
      notify("Your auto-picked seats are locked. Continue to checkout.");
      return;
    }
    if (seat.classId !== data.queue.classId) return;
    await perform("hold", { seatId: seat.id }, "seat:" + seat.id);
  };
  const autoPick = async () => {
    const next = await perform("hold", { mode: "auto" }, "auto");
    if (next?.hold) {
      notify("Random seats secured. This selection is locked for checkout.");
      setCheckoutOpen(true);
    }
  };
  const leave = async () => {
    const next = await perform("leave", {}, "leave");
    if (next) {
      lastHold.current = null;
      notify("Your reservation was released.");
      setCheckoutOpen(false);
      paymentKey.current = null;
    }
  };
  const pay = async () => {
    if (busy || !data.hold) return;
    setBusy("pay");
    paying.current = true;
    try {
      if (!paymentKey.current || paymentKey.current.hold !== data.hold.id)
        paymentKey.current = { hold: data.hold.id, key: crypto.randomUUID() };
      const result = await api("/events/" + id + "/pay", {
        key: paymentKey.current.key,
        holdId: data.hold.id,
        outcome,
      });
      if (result.ok) {
        setConfirmed(result);
        setCheckoutOpen(false);
        lastHold.current = null;
        notify("It’s official. You’re going.");
      } else {
        setCheckoutOpen(false);
        lastHold.current = null;
        notify(result.message, "error");
        paymentKey.current = null;
      }
      await Promise.all([refreshUser(), refresh()]);
    } catch (e) {
      notify(e.message, "error");
      await refresh();
    } finally {
      setBusy("");
      paying.current = false;
    }
  };
  useEffect(() => {
    const launch = data?.launch;
    if (!user || !launch || launch.canBook || launch.phase === 'scheduled' || launch.entry) return;
    const key = id + ':' + user.id;
    if (launchJoining.current || lastLaunch.current === key) return;
    lastLaunch.current = key;
    launchJoining.current = true;
    setBusy('launch');
    api('/events/' + id + '/launch', {}).then(apply)
      .catch(e => notify(e.message, 'error'))
      .finally(() => { launchJoining.current = false; setBusy(''); });
  }, [id, user?.id, data?.launch?.phase, data?.launch?.entry?.queueNumber, apply, notify]);
  if (error && !data)
    return (
      <div className="page-width standard-page">
        <ErrorBox>{error}</ErrorBox>
        <Button className="button-primary" onClick={() => refresh()}>
          <RefreshCw size={16} />
          Retry loading the venue
        </Button>
        <Button className="button-outline" onClick={() => navigate("/")}>
          <ArrowLeft size={16} />
          Back to experiences
        </Button>
      </div>
    );
  if (!data)
    return (
      <div className="page-width loading-area booking-loading">
        <Spinner label="Getting the venue ready" />
      </div>
    );
  const cls = data.classes.find((c) => c.id === chosen) || data.classes[0];
  const queue = data.queue,
    hold = data.hold,
    admitted = queue && ["admitted", "holding"].includes(queue.state),
    waiting = queue?.state === "waiting";
  const selected = hold?.seats.map((s) => s.id) || [],
    full = selected.length === quantity,
    total = selected.length * cls.price;
  const activeClass = queue?.classId || cls.id;
  const showBooking = admitted || !!hold;
  const launchBlocked = data.launch && !data.launch.canBook;
  return (
    <div className="event-page page-width">
      <button className="back-link" onClick={() => navigate("/")}>
        <ArrowLeft size={15} />
        All experiences
      </button>
      <section className="event-banner">
        <img
          className="event-banner-image"
          src={data.image}
          alt={`${data.category} event atmosphere`}
        />
        <div className="event-banner-overlay" />
        <div className="event-banner-content">
          <Pill className="pill-light">
            {data.category.toUpperCase()} / BENGALURU
          </Pill>
          <h1>{data.title}</h1>
          <p>{data.artist}</p>
          <div className="event-banner-facts">
            <span>
              <CalendarDays size={16} />
              {fullDate(data.date)}
            </span>
            <span>
              <Clock3 size={16} />
              {timeLabel(data.date)}
            </span>
            <span>
              <MapPin size={16} />
              {data.venue}, {data.city}
            </span>
          </div>
        </div>
        <span className="banner-ticket-icon" aria-hidden="true">
          ✳
        </span>
      </section>
      <div className="booking-steps">
        <span className="active">
          <i>01</i>Find your spot
        </span>
        <ChevronRight size={14} />
        <span className={hold ? "active" : ""}>
          <i>02</i>Make it official
        </span>
        <ChevronRight size={14} />
        <span className={confirmed ? "active" : ""}>
          <i>03</i>You’re on the list
        </span>
        <div className="live-inventory">
          <span className="live-dot" />
          {pollError || "LIVE AVAILABILITY"}
        </div>
      </div>
      {launchBlocked && <LaunchRoom launch={data.launch} serverTime={data.serverTime} user={user} busy={!!busy} onJoin={joinLaunch} pollError={pollError} />}
      {!launchBlocked && data.launch?.entry?.admittedAt && <div className="launch-admitted"><CheckCircle2 size={20} /><span><strong>You’re in! Queue #{data.launch.entry.queueNumber} has been admitted.</strong> Choose a class below. Seats are only reserved after selection.</span></div>}
      {!launchBlocked && <div className="booking-layout">
        <div className="booking-main">
          <section className="class-section">
            <div className="section-heading compact">
              <div>
                <Eyebrow>YOUR NIGHT. YOUR VIEW.</Eyebrow>
                <h2>Pick your kind of spot.</h2>
              </div>
              <div className="quantity-picker">
                <span>Tickets</span>
                <button
                  aria-label="Remove one ticket"
                  disabled={quantity <= 1 || !!queue || !!hold}
                  onClick={() => setQuantity(quantity - 1)}
                >
                  <Minus size={14} />
                </button>
                <strong>{quantity}</strong>
                <button
                  aria-label="Add one ticket"
                  disabled={quantity >= 4 || !!queue || !!hold}
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="class-cards">
              {data.classes.map((c) => (
                <button
                  className={
                    "class-card " + (chosen === c.id ? "selected" : "")
                  }
                  style={{ "--class-color": c.color }}
                  key={c.id}
                  disabled={!!hold}
                  onClick={async () => {
                    if (queue) {
                      await perform("leave", {}, "change");
                      lastHold.current = null;
                    }
                    setChosen(c.id);
                  }}
                >
                  <div className="row-between">
                    <span className="class-label">
                      <i />
                      {c.label}
                    </span>
                    <span className="class-radio">
                      {chosen === c.id && <Check size={12} />}
                    </span>
                  </div>
                  <h3>{c.name}</h3>
                  <strong>
                    {money(c.price)}
                    <small>/ person</small>
                  </strong>
                  <p>{c.description}</p>
                  <div
                    className={"class-stock " + (!c.admissible ? "full" : "")}
                  >
                    {c.admissible
                      ? `${c.admissible} spots open for admission`
                      : "Full right now · waiting room open"}
                  </div>
                </button>
              ))}
            </div>
            <div className="class-perks">
              {cls.perks?.map((p) => (
                <span key={p}>
                  <Check size={13} />
                  {p}
                </span>
              ))}
            </div>
          </section>
          <section className="seat-selection" id="seat-selection">
            <div className="section-heading compact">
              <div>
                <Eyebrow>
                  {waiting ? "YOUR PLACE IS SAVED" : "MEET THE VENUE"}
                </Eyebrow>
                <h2>
                  {waiting
                    ? "Good things are worth the wait."
                    : showBooking
                      ? "Your seat. Your moment."
                      : "Picture yourself here."}
                </h2>
              </div>
              {!waiting && (
                <div className="map-controls">
                  <button
                    className="icon-button"
                    onClick={() => setZoom(Math.max(1, zoom - 0.25))}
                    disabled={zoom <= 1}
                    aria-label="Zoom out venue"
                  >
                    <ZoomOut size={17} />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    className="icon-button"
                    onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                    disabled={zoom >= 2}
                    aria-label="Zoom in venue"
                  >
                    <ZoomIn size={17} />
                  </button>
                </div>
              )}
            </div>
            {waiting ? (
              <div className="waiting-room">
                <div className="waiting-orbits">
                  <span />
                  <span />
                  <span />
                  <Ticket size={35} />
                </div>
                <Pill className="pill-green">
                  YOU’RE IN THE {cls.label} WAITING ROOM
                </Pill>
                <h2>Your night’s still on the cards.</h2>
                <p>
                  This class is fully allocated right now. When enough seats
                  open for your{" "}
                  {quantity === 1 ? "ticket" : `group of ${quantity}`}, we’ll
                  bring you in automatically.
                </p>
                <div className="queue-position">
                  <div>
                    <small>YOUR PLACE IN LINE</small>
                    <strong>{String(queue.position).padStart(2, "0")}</strong>
                  </div>
                  <div>
                    <small>TICKETS REQUESTED</small>
                    <strong>{quantity}</strong>
                  </div>
                  <div>
                    <small>CLASS</small>
                    <strong>{cls.label}</strong>
                  </div>
                </div>
                <div className="waiting-status">
                  <LoaderCircle size={15} />
                  <span>
                    {pollError || "Checking for released seats every 3 seconds"}
                  </span>
                </div>
                <p className="small-note">
                  Keep this page open. Refreshing won’t change your place in
                  line. Entry depends on seats becoming available.
                </p>
                <button className="text-link" disabled={!!busy} onClick={leave}>
                  Leave waiting room
                  <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <>
                {queue?.state === "admitted" && !hold && (
                  <div className="admission-banner">
                    <DoorOpen size={18} />
                    <span>
                      You’re in. Choose{" "}
                      {quantity === 1 ? "a seat" : `${quantity} seats`} in{" "}
                      <strong>{cls.label}</strong> within{" "}
                      <Countdown until={queue.expiresAt} onExpire={refresh} />.
                    </span>
                  </div>
                )}
                {hold && (
                  <div className="admission-banner">
                    <LockKeyhole size={17} />
                    <span>
                      {hold.mode === "auto"
                        ? "Auto-picked & locked."
                        : "Your seats are held."}{" "}
                      Finish checkout within{" "}
                      <Countdown until={hold.expiresAt} onExpire={refresh} />.
                    </span>
                  </div>
                )}
                <div
                  className={"stadium-wrap " + (!showBooking ? "preview" : "")}
                >
                  <div className="stadium-meta">
                    <span>{data.venue.toUpperCase()} / SEATING PLAN</span>
                    <span>
                      <Headphones size={13} />
                      {data.sectionPlan ? `${data.classes.length} SECTIONS · ${data.seats.length} SEATS` : '360° SOUND. ONE SHARED FEELING.'}
                    </span>
                  </div>
                  <svg
                    className="stadium-map"
                    viewBox={`${420 - 420 / zoom} ${240 - 240 / zoom} ${840 / zoom} ${480 / zoom}`}
                    role="group"
                    aria-label="Interactive venue seating map"
                  >
                    <defs>
                      <linearGradient
                        id="stage-shine"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop stopColor="#d5fd71" stopOpacity=".16" />
                        <stop
                          offset="1"
                          stopColor="#d5fd71"
                          stopOpacity=".02"
                        />
                      </linearGradient>
                    </defs>
                    {data.venueLayout !== 'theatre' && <><path
                      d="M 34 118 A 386 354 0 0 0 806 118"
                      fill="none"
                      stroke="#272a25"
                      strokeWidth="1"
                    />
                    <path
                      d="M 45 118 A 375 343 0 0 0 795 118"
                      fill="none"
                      stroke="#20231e"
                      strokeWidth="1"
                    />
                    <path
                      d="M 88 122 A 332 295 0 0 0 752 122"
                      fill="none"
                      stroke="#242720"
                      strokeWidth="1"
                      strokeDasharray="3 6"
                    />
                    <path
                      d="M 168 124 A 252 220 0 0 0 672 124"
                      fill="none"
                      stroke="#242720"
                      strokeWidth="1"
                      strokeDasharray="3 6"
                    /></>}
                    {data.venueLayout === 'theatre' && Array.from({ length: data.sectionPlan?.reduce((sum, section) => sum + section.rows, 0) || 0 }, (_, row) => <path key={row} d={`M 92 ${194 + row * 27} H 748`} stroke="#242720" strokeWidth="1" fill="none" />)}
                    {data.venueLayout === 'stadium' && Array.from({ length: data.sectionPlan?.reduce((sum, section) => sum + section.rows, 0) || 0 }, (_, row) => <path key={row} d={`M 92 ${202 + row * 27} Q 420 ${166 + row * 27} 748 ${202 + row * 27}`} stroke="#252b25" strokeWidth="1" fill="none" />)}
                    <path
                      d="M 270 66 L570 66 L550 124 L290 124 Z"
                      fill="url(#stage-shine)"
                      stroke="#596044"
                      strokeWidth="1"
                    />
                    <text
                      x="420"
                      y="99"
                      textAnchor="middle"
                      className="stage-label"
                    >
                      THE STAGE
                    </text>
                    {!data.sectionPlan && <>
                    <path
                      d="M305 133 Q420 150 535 133"
                      fill="none"
                      stroke="#657345"
                      strokeWidth="1"
                    />
                    <text
                      x="420"
                      y="188"
                      textAnchor="middle"
                      className="floor-wordmark"
                    >
                      FEEL IT ALL.
                    </text>
                    <text
                      x="420"
                      y="207"
                      textAnchor="middle"
                      className="floor-subtitle"
                    >
                      YOUR NIGHT STARTS HERE
                    </text>
                    <text
                      x="420"
                      y="236"
                      textAnchor="middle"
                      className="zone-map-label"
                      fill="#b8a4f8"
                    >
                      FRONT ROW
                    </text>
                    <text
                      x="420"
                      y="311"
                      textAnchor="middle"
                      className="zone-map-label"
                      fill="#f4ca78"
                    >
                      THE SWEET SPOT
                    </text>
                    <text
                      x="420"
                      y="389"
                      textAnchor="middle"
                      className="zone-map-label"
                      fill="#8fc7db"
                    >
                      GOOD VIBES
                    </text></>}
                    {data.sectionPlan && data.classes.map((section, index) => <text key={section.id} x="38" y={229 + index * 36} className="zone-map-label" fill={section.color}>{section.label}</text>)}
                    {data.seats.map((seat) => {
                      const mine = selected.includes(seat.id),
                        available = seat.status === "available",
                        classMatch = seat.classId === activeClass,
                        c = data.classes.find((c) => c.id === seat.classId),
                        enabled =
                          showBooking &&
                          classMatch &&
                          !busy &&
                          (available || mine) &&
                          hold?.mode !== "auto";
                      const fill = mine
                        ? "#d5fd71"
                        : !available
                          ? "#34372f"
                          : classMatch || !showBooking
                            ? c.color
                            : "#555b4a";
                      return (
                        <g
                          key={seat.id}
                          transform={`translate(${seat.x},${seat.y}) rotate(${seat.rotation})`}
                          className={
                            "seat " +
                            (mine ? "mine" : "") +
                            " " +
                            (enabled ? "selectable" : "")
                          }
                          role={enabled ? "button" : undefined}
                          tabIndex={enabled ? 0 : undefined}
                          aria-label={`Seat ${seat.id}, ${c.label}, ${mine ? "selected by you" : seat.status}`}
                          aria-pressed={enabled ? mine : undefined}
                          onClick={() => enabled && pick(seat)}
                          onKeyDown={(e) => {
                            if (enabled && ["Enter", " "].includes(e.key)) {
                              e.preventDefault();
                              pick(seat);
                            }
                          }}
                          onMouseEnter={() =>
                            setHover({ ...seat, mine, className: c.label })
                          }
                          onMouseLeave={() => setHover(null)}
                        >
                          <rect
                            x="-9"
                            y="-10"
                            width="18"
                            height="22"
                            fill="transparent"
                          />
                          <rect
                            x="-5"
                            y="-5"
                            width="10"
                            height="9"
                            rx="2"
                            fill={fill}
                            opacity={available || mine ? 1 : 0.65}
                          />
                          <path
                            d="M-5 6 L5 6"
                            stroke={fill}
                            strokeWidth="1.7"
                          />
                          <title>
                            {seat.id} · {c.label} ·{" "}
                            {mine ? "Held for you" : seat.status}
                          </title>
                        </g>
                      );
                    })}
                    <text x="72" y="447" className="exit-label">
                      ↙ ENTRY A
                    </text>
                    <text x="710" y="447" className="exit-label">
                      ENTRY B ↘
                    </text>
                    <text
                      x="420"
                      y="466"
                      textAnchor="middle"
                      className="venue-note"
                    >
                      All seats face the stage. Map is a visual seating guide.
                    </text>
                  </svg>
                  <div className="map-status-line">
                    {hover ? (
                      <span>
                        <strong>{hover.id}</strong> · {hover.className} ·{" "}
                        {hover.mine ? "Held for you" : hover.status}
                      </span>
                    ) : (
                      <span>
                        {showBooking
                          ? hold?.mode === "auto"
                            ? "Your random selection is locked."
                            : `Select ${quantity} seat${quantity > 1 ? "s" : ""} in the ${cls.label} section.`
                          : "Choose your ticket class and enter booking to select seats."}
                      </span>
                    )}
                  </div>
                </div>
                <div className="seat-legend">
                  <span>
                    <i className="legend-available" />
                    Available in your class
                  </span>
                  <span>
                    <i className="legend-selected" />
                    Your selection
                  </span>
                  <span>
                    <i className="legend-unavailable" />
                    Unavailable
                  </span>
                </div>
                {showBooking && !hold && (
                  <button
                    className="auto-pick-banner"
                    disabled={!!busy}
                    onClick={autoPick}
                  >
                    <span className="auto-pick-icon">
                      <Shuffle size={23} />
                    </span>
                    <div>
                      <strong>Let the night surprise you.</strong>
                      <p>
                        Auto-pick{" "}
                        {quantity === 1
                          ? "a random seat"
                          : `${quantity} random seats`}{" "}
                        in {cls.label}. Instantly held. Selection locked.
                      </p>
                    </div>
                    {busy === "auto" ? (
                      <LoaderCircle className="spin" size={20} />
                    ) : (
                      <ArrowUpRight size={23} />
                    )}
                  </button>
                )}
              </>
            )}
          </section>
          <section className="event-about">
            <Eyebrow>THE FEELING, IN A FEW WORDS</Eyebrow>
            <h2>A night worth showing up for.</h2>
            <p>{data.description}</p>
            {data.lineup?.length > 0 && (
              <div className="lineup">
                <span>ON THE LINEUP</span>
                {data.lineup.map((name) => (
                  <strong key={name}>{name}</strong>
                ))}
              </div>
            )}
            <div className="event-extra-facts">
              <div>
                <DoorOpen size={19} />
                <span>
                  Doors open<strong>{data.doors}</strong>
                </span>
              </div>
              <div>
                <Volume2 size={19} />
                <span>
                  Show duration<strong>{data.duration}</strong>
                </span>
              </div>
              <div>
                <ShieldCheck size={19} />
                <span>
                  Entry requirement<strong>Valid SeatWise QR ticket</strong>
                </span>
              </div>
            </div>
          </section>
        </div>
        <aside className="booking-sidebar">
          <div className="order-card">
            <div className="row-between">
              <Eyebrow>MAKE IT A PLAN</Eyebrow>
              <Ticket size={20} />
            </div>
            <h2>{hold ? "Your night, reserved." : "A good night awaits."}</h2>
            <div className="order-event">
              <img src={data.image} alt="" />
              <div>
                <strong>{data.title}</strong>
                <span>{fullDate(data.date)}</span>
                <span>{data.venue}</span>
              </div>
            </div>
            <div className="order-line">
              <span>Ticket class</span>
              <strong style={{ color: cls.color }}>
                {cls.label} · {cls.name}
              </strong>
            </div>
            <div className="order-line">
              <span>
                {quantity} × {money(cls.price)}
              </span>
              <strong>{money(quantity * cls.price)}</strong>
            </div>
            <div className="order-line">
              <span>Booking fee</span>
              <span className="green-text">On us.</span>
            </div>
            {selected.length > 0 && (
              <div className="selected-seats">
                <span>
                  YOUR {hold.mode === "auto" ? "AUTO-PICKED " : ""}SEATS
                </span>
                <div>
                  {selected.map((s) => (
                    <span key={s}>
                      <LockKeyhole size={12} />
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="order-total">
              <span>Total</span>
              <strong>{money(quantity * cls.price)}</strong>
            </div>
            {hold ? (
              <>
                <div className="hold-countdown">
                  <Clock3 size={16} />
                  <span>Held for you</span>
                  <Countdown until={hold.expiresAt} onExpire={refresh} />
                </div>
                <Button
                  className="button-primary full-width"
                  disabled={!full || !!busy}
                  onClick={() => setCheckoutOpen(true)}
                >
                  {full
                    ? "Continue to checkout"
                    : `Select ${quantity - selected.length} more seat${quantity - selected.length > 1 ? "s" : ""}`}
                  <ArrowRight size={17} />
                </Button>
                {hold.mode === "auto" && (
                  <p className="auto-locked-note">
                    <LockKeyhole size={12} />
                    Random selection locked for this reservation.
                  </p>
                )}
                <button
                  className="subtle-button full-width"
                  disabled={!!busy}
                  onClick={leave}
                >
                  Release reservation
                </button>
              </>
            ) : waiting ? (
              <>
                <div className="waiting-sidebar">
                  <span className="live-dot" />
                  You’re #{queue.position} in the {cls.label} queue
                </div>
                <p className="small-note">
                  We’ll open seat selection automatically when there’s space for
                  your group.
                </p>
              </>
            ) : admitted ? (
              <>
                <Button
                  className="button-primary full-width"
                  loading={busy === "auto"}
                  disabled={!!busy}
                  onClick={autoPick}
                >
                  <Shuffle size={17} />
                  Auto-pick & hold seats
                </Button>
                <p className="small-note">
                  Or choose your own seats on the map.
                </p>
                <button
                  className="subtle-button full-width"
                  disabled={!!busy}
                  onClick={leave}
                >
                  Leave booking session
                </button>
              </>
            ) : (
              <>
                <Button
                  className="button-primary full-width"
                  onClick={join}
                  loading={busy === "join"}
                  disabled={!!busy}
                >
                  {!user
                    ? "Sign in to book"
                    : cls.admissible >= quantity
                      ? "Let’s find my seats"
                      : "Join waiting room"}
                  <ArrowUpRight size={18} />
                </Button>
                <p className="small-note">
                  {cls.admissible >= quantity
                    ? "Entry is based on live capacity. Seats are held after selection."
                    : "You’ll keep your place in this class’s queue until space opens."}
                </p>
              </>
            )}
            <div className="secure-checkout">
              <ShieldCheck size={15} />
              Fair access. Secure reservations.
            </div>
          </div>
          <div className="booking-help">
            <Info size={17} />
            <p>
              Up to 4 tickets per person, per event. Cancellations available
              until 2 hours before showtime.
            </p>
          </div>
          {user && (
            <button
              className="sidebar-wallet"
              onClick={() => navigate("/wallet")}
            >
              <Wallet size={17} />
              <span>
                Your demo wallet<strong>{money(user.wallet)}</strong>
              </span>
              <ArrowUpRight size={16} />
            </button>
          )}
        </aside>
      </div>
      }
      {checkoutOpen && hold && (
        <Modal
          title="Make it official."
          onClose={() => {
            if (!busy) setCheckoutOpen(false);
          }}
        >
          <div className="checkout-event">
            <img src={data.image} alt="" />
            <div>
              <Eyebrow>
                {cls.label} · {selected.join(", ")}
              </Eyebrow>
              <h3>{data.title}</h3>
              <span>
                {quantity} ticket{quantity > 1 ? "s" : ""} ·{" "}
                {fullDate(data.date)}
              </span>
            </div>
          </div>
          <div className="checkout-wallet">
            <div>
              <Wallet size={21} />
              <span>
                Pay with demo wallet
                <small>Available: {money(user?.wallet)}</small>
              </span>
            </div>
            <strong>{money(total)}</strong>
          </div>
          <div className="hold-countdown">
            <LockKeyhole size={15} />
            <span>Your seats are held for</span>
            <Countdown until={hold.expiresAt} onExpire={refresh} />
          </div>
          <fieldset className="payment-outcomes">
            <legend>DEMO PAYMENT OUTCOME</legend>
            {[
              ["success", "Success"],
              ["failure", "Failure"],
              ["timeout", "Timeout"],
            ].map(([value, label]) => (
              <label className={outcome === value ? "active" : ""} key={value}>
                <input
                  type="radio"
                  name="payment-outcome"
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="small-note">
            This is a working demo. Only successful payments deduct funds.
            Failed or timed-out payments release your seats.
          </p>
          <Button
            className="button-primary full-width"
            onClick={pay}
            loading={busy === "pay"}
            disabled={!!busy}
          >
            <LockKeyhole size={16} />
            {outcome === "success"
              ? `Pay ${money(total)} & confirm`
              : `Simulate payment ${outcome}`}
            <ArrowRight size={17} />
          </Button>
        </Modal>
      )}
      {confirmed && (
        <Modal
          title="You had to be there. And you will."
          onClose={() => {
            setConfirmed(null);
            navigate("/tickets");
          }}
        >
          <div className="confirmation">
            <div className="confirmation-mark">
              <Check size={40} />
            </div>
            <Eyebrow>IT’S OFFICIAL</Eyebrow>
            <h2>
              You’re going to
              <br />
              {data.title}.
            </h2>
            <p>
              Your seats are confirmed. Grab your people.
              <br />
              We’ll see you under the lights.
            </p>
            <div className="confirmation-ref">
              <span>BOOKING REFERENCE</span>
              <strong>{confirmed.reference}</strong>
            </div>
            <Button
              className="button-primary full-width"
              onClick={() => navigate("/tickets")}
            >
              Take me to my tickets
              <Ticket size={17} />
            </Button>
            <p className="small-note">
              Your QR entry passes are ready in My tickets.
            </p>
          </div>
        </Modal>
      )}
      {!launchBlocked && !waiting && !confirmed && (
        <div className="mobile-booking-bar">
          <div>
            <span>
              {quantity} {cls.label} ticket{quantity > 1 ? "s" : ""}
            </span>
            <strong>{money(quantity * cls.price)}</strong>
          </div>
          <Button
            className="button-primary"
            disabled={!!busy}
            loading={busy === "join" || busy === "auto"}
            onClick={() =>
              hold
                ? full
                  ? setCheckoutOpen(true)
                  : document
                      .getElementById("seat-selection")
                      ?.scrollIntoView({ behavior: "smooth" })
                : admitted
                  ? autoPick()
                  : join()
            }
          >
            {hold
              ? full
                ? "Checkout"
                : `${selected.length}/${quantity} seats selected`
              : admitted
                ? "Auto-pick & hold"
                : cls.admissible >= quantity
                  ? "Find my seats"
                  : "Join waiting room"}
            <ArrowRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
