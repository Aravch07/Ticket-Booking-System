"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  X,
  ArrowUpRight,
  LoaderCircle,
  Check,
  AlertCircle,
} from "lucide-react";
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
export const dateLabel = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
export const fullDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
export const timeLabel = (date) =>
  new Date(date).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
export async function api(path, body) {
  const attempts = body === undefined ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch("/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("The server is temporarily unavailable. Please retry.");
      }
      if (!res.ok) {
        const error = new Error(data.error || "Please try again.");
        error.code = data.code;
        error.status = res.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (attempt + 1 < attempts && (!error.status || error.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      if (error.name === "TimeoutError")
        throw new Error(
          "The request timed out. Check your booking status before trying again.",
        );
      throw error;
    }
  }
}
export function Spinner({ label = "Loading" }) {
  return (
    <span className="spinner">
      <LoaderCircle size={18} />
      <span>{label}</span>
    </span>
  );
}
export function Button({ children, loading, className = "", ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={"button " + className}
    >
      {loading ? <Spinner label="One moment" /> : children}
    </button>
  );
}
export function Eyebrow({ children, className = "" }) {
  return <div className={"eyebrow " + className}>{children}</div>;
}
export function Pill({ children, className = "", ...props }) {
  return (
    <span {...props} className={"pill " + className}>
      {children}
    </span>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll(
          "button,a,input,select,textarea",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Empty({ icon: Icon = AlertCircle, title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={30} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ArrowLink({ children, onClick }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={17} />
    </button>
  );
}
export function ErrorBox({ children }) {
  return children ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{children}</span>
    </div>
  ) : null;
}
export function Countdown({ until, onExpire }) {
  const [seconds, setSeconds] = useState(
    Math.max(0, Math.ceil((new Date(until) - Date.now()) / 1000)),
  );
  const done = useRef(false);
  useEffect(() => {
    done.current = false;
    const tick = () => {
      const next = Math.max(
        0,
        Math.ceil((new Date(until) - Date.now()) / 1000),
      );
      setSeconds(next);
      if (!next && !done.current) {
        done.current = true;
        onExpire?.();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until, onExpire]);
  return (
    <span className={"countdown " + (seconds < 30 ? "urgent" : "")}>
      {String(Math.floor(seconds / 60)).padStart(2, "0")}:
      {String(seconds % 60).padStart(2, "0")}
    </span>
  );
}
