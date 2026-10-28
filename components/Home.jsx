"use client";
import { useEffect, useState, useMemo } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Music2,
  Mic2,
  Drama,
  Sparkles,
  MapPin,
  CalendarDays,
  ShieldCheck,
  Clock3,
  Ticket,
  Headphones,
  Disc3,
  Heart,
  SlidersHorizontal,
} from "lucide-react";
import {
  api,
  useApp,
  money,
  dateLabel,
  Eyebrow,
  Pill,
  Button,
  ErrorBox,
  Spinner,
} from "./ui.jsx";

const categories = [
  ["All experiences", Sparkles],
  ["Electronic", Disc3],
  ["Indie", Headphones],
  ["Live music", Music2],
  ["Comedy", Mic2],
  ["Theatre", Drama],
];
export default function Home() {
  const { navigate } = useApp();
  const [events, setEvents] = useState([]),
    [category, setCategory] = useState("All experiences"),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saved, setSaved] = useState([]);
  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem("seatwise-saved") || "[]"));
    } catch {}
    api("/events")
      .then((d) => setEvents(d.events))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const save = (e, id) => {
    e.stopPropagation();
    setSaved((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      localStorage.setItem("seatwise-saved", JSON.stringify(next));
      return next;
    });
  };
  const visible = useMemo(
    () =>
      events.filter(
        (e) =>
          (category === "All experiences" || e.category === category) &&
          `${e.title} ${e.category} ${e.venue}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [events, category, query],
  );
  const hero = events.find((e) => e.id === "electric-bloom"),
    side = events.filter((e) => ["afterhours", "indie-state"].includes(e.id));
  const goExplore = () =>
    document
      .getElementById("experiences")
      ?.scrollIntoView({ behavior: "smooth" });
  return (
    <div className="home-page page-width">
      <section className="home-intro">
        <div>
          <Eyebrow>
            <span className="live-dot" /> GO OUT. TUNE IN. FEEL SOMETHING.
          </Eyebrow>
          <h1>
            Less scrolling.
            <br />
            More{" "}
            <span className="heading-accent">
              living.
              <svg viewBox="0 0 250 18" aria-hidden="true">
                <path d="M4 12 Q110 -2 244 8" />
              </svg>
            </span>
          </h1>
        </div>
        <div className="intro-side">
          <p>
            The nights you’ll talk about.
            <br />
            The people you’ll find.
            <br />
            Your next <em>“you had to be there.”</em>
          </p>
          <button
            className="circle-arrow"
            onClick={goExplore}
            aria-label="Explore upcoming experiences"
          >
            <ArrowRight size={25} />
          </button>
        </div>
      </section>
      <ErrorBox>{error}</ErrorBox>
      <section className="hero-grid" aria-label="Featured experiences">
        <article
          className="hero-event"
          style={{ backgroundImage: "url('/images/bloom.jpg')" }}
        >
          <div className="hero-shade" />
          <div className="hero-card-top">
            <Pill className="pill-light">
              <span className="live-dot" /> THE BIG NIGHT
            </Pill>
            <span className="hero-edition">BENGALURU / VOL. 01</span>
          </div>
          <div className="hero-event-content">
            <div className="hero-genres">ELECTRONIC · MUSIC · PURE ENERGY</div>
            <h2>
              Electric
              <br />
              <span>Bloom</span>
              <span className="hero-star">✳</span>
            </h2>
            <p>One city. A thousand heartbeats. All in sync.</p>
            <div className="hero-event-bottom">
              <div className="hero-facts">
                <span>
                  <CalendarDays size={16} />
                  12 DEC, 2026
                </span>
                <span>
                  <MapPin size={16} />
                  Echo Arena
                </span>
              </div>
              <button
                className="button button-primary"
                onClick={() => navigate("/event/electric-bloom")}
              >
                Get tickets
                <ArrowUpRight size={18} />
              </button>
            </div>
          </div>
        </article>
        <div className="hero-side">
          <article className="weekend-card">
            <div className="weekend-top">
              <span className="eyebrow">A LITTLE REMINDER</span>
              <ArrowUpRight size={21} />
            </div>
            <h2>
              Your group chat
              <br />
              deserves a<br />
              <span>real plan.</span>
            </h2>
            <p>
              Send the link. Pick your seats.
              <br />
              Make it a night.
            </p>
            <button className="dark-text-link" onClick={goExplore}>
              Find your kind of night
              <ArrowRight size={17} />
            </button>
            <span className="weekend-doodle" aria-hidden="true">
              ✳
            </span>
          </article>
          <div className="mini-events">
            {side.map((event) => (
              <button
                className="mini-event"
                key={event.id}
                onClick={() => navigate("/event/" + event.id)}
              >
                <img src={event.image} alt="" />
                <div>
                  <span>
                    {dateLabel(event.date)} · {event.category}
                  </span>
                  <h3>{event.title}</h3>
                  <small>From {money(event.basePrice)}</small>
                </div>
                <ArrowUpRight size={21} />
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="trust-strip">
        <span>
          <ShieldCheck size={16} />A seat that’s actually yours
        </span>
        <span>
          <Clock3 size={16} />5 minutes to make it official
        </span>
        <span>
          <Ticket size={16} />
          Fair queues. Zero queue-jumping.
        </span>
        <span className="trust-wordmark">ALL VIBES. NO BOOKING DRAMA.</span>
      </div>
      <section className="experiences-section" id="experiences">
        <div className="section-heading">
          <div>
            <Eyebrow>FIND YOUR PEOPLE</Eyebrow>
            <h2>What’s your scene?</h2>
          </div>
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search experiences"
              placeholder="Artist, event, or a whole vibe..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span>↵</span>
          </label>
        </div>
        <div className="category-row">
          {categories.map(([name, Icon]) => (
            <button
              key={name}
              className={
                "category-chip " + (category === name ? "selected" : "")
              }
              onClick={() => setCategory(name)}
            >
              <Icon size={16} />
              {name}
            </button>
          ))}
          <span className="event-count">
            {visible.length} experiences, endless memories
          </span>
        </div>
        {loading ? (
          <div className="loading-area">
            <Spinner label="Finding your next favourite night" />
          </div>
        ) : (
          <div className="event-grid">
            {visible.map((event) => (
              <article className="event-card" key={event.id}>
                <div className="event-image-wrap">
                  <button
                    className="event-image-button"
                    onClick={() => navigate("/event/" + event.id)}
                    aria-label={"View " + event.title}
                  >
                    <img
                      src={event.image}
                      alt={`${event.category} live performance atmosphere`}
                      loading="lazy"
                    />
                  </button>
                  <Pill
                    className={
                      event.available === 0 ? "pill-waitlist" : "pill-dark"
                    }
                  >
                    {event.available === 0
                      ? "WAITLIST OPEN"
                      : (event.category || "Live show").toUpperCase()}
                  </Pill>
                  <button
                    className={
                      "save-button " + (saved.includes(event.id) ? "saved" : "")
                    }
                    onClick={(e) => save(e, event.id)}
                    aria-label={
                      saved.includes(event.id)
                        ? "Unsave " + event.title
                        : "Save " + event.title
                    }
                  >
                    <Heart
                      size={17}
                      fill={saved.includes(event.id) ? "currentColor" : "none"}
                    />
                  </button>
                  <span className="event-date-stamp">
                    <strong>{new Date(event.date).getDate()}</strong>
                    <span>
                      {new Date(event.date)
                        .toLocaleDateString("en-IN", { month: "short" })
                        .toUpperCase()}
                    </span>
                  </span>
                </div>
                <button
                  className="event-card-info"
                  onClick={() => navigate("/event/" + event.id)}
                >
                  <div className="event-card-title">
                    <h3>{event.title}</h3>
                    <ArrowUpRight size={21} />
                  </div>
                  <p>
                    <MapPin size={13} />
                    {event.venue} · {event.city}
                  </p>
                  <div className="event-card-bottom">
                    <span>
                      From <strong>{money(event.basePrice)}</strong>
                    </span>
                    <span
                      className={
                        event.available === 0
                          ? "availability wait"
                          : "availability"
                      }
                    >
                      <i />
                      {event.available === 0
                        ? "Join the waiting room"
                        : "Tickets available"}
                    </span>
                  </div>
                </button>
              </article>
            ))}
          </div>
        )}
        {!loading && !visible.length && (
          <div className="empty-state">
            <Search size={30} />
            <h3>No nights found. Yet.</h3>
            <p>Try a different search or explore another scene.</p>
            <button
              className="text-link"
              onClick={() => {
                setQuery("");
                setCategory("All experiences");
              }}
            >
              Show all experiences
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
      <section className="manifesto">
        <div className="manifesto-icon">
          <AsteriskMark />
        </div>
        <div>
          <Eyebrow>THE SEATWISE WAY</Eyebrow>
          <h2>
            Good energy.
            <br />
            Better booking.
          </h2>
          <p>
            Your spot is held while you pay. Your place in line stays yours. And
            your ticket gets you through the door, once. Simple as it should be.
          </p>
          <button
            className="text-link"
            onClick={() => navigate("/how-it-works")}
          >
            A little more about us
            <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="manifesto-ticket">
          <span>ADMIT ONE</span>
          <strong>
            YOU.
            <br />
            OFFLINE.
          </strong>
          <div className="ticket-bars" />
          <small>MORE MOMENTS. LESS FOMO.</small>
        </div>
      </section>
    </div>
  );
}
function AsteriskMark() {
  return <span aria-hidden="true">✳</span>;
}
