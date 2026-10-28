"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Asterisk,
  ArrowUpRight,
  MapPin,
  ChevronDown,
  Wallet,
  Ticket,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Check,
  AlertCircle,
  LayoutDashboard,
} from "lucide-react";
import { AppContext, api, money } from "./ui.jsx";
import Home from "./Home.jsx";
import Booking from "./Booking.jsx";
import {
  AuthScreen,
  TicketsScreen,
  WalletScreen,
  HowScreen,
} from "./Screens.jsx";
import Admin from "./Admin.jsx";

export default function SeatWiseApp({ initialPath = "/" }) {
  const [path, setPath] = useState(initialPath),
    [user, setUser] = useState(null),
    [authLoaded, setAuthLoaded] = useState(false),
    [toast, setToast] = useState(null),
    [menu, setMenu] = useState(false);
  const navigate = useCallback((next) => {
    window.history.pushState({}, "", next);
    setPath(next);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const notify = useCallback(
    (message, type = "success") => setToast({ message, type, id: Date.now() }),
    [],
  );
  const refreshUser = useCallback(async () => {
    const data = await api("/me");
    setUser(data.user);
    return data.user;
  }, []);
  useEffect(() => {
    setPath(window.location.pathname + window.location.search);
    const pop = () => {
      setPath(window.location.pathname + window.location.search);
      setMenu(false);
    };
    window.addEventListener("popstate", pop);
    refreshUser()
      .catch(() => {})
      .finally(() => setAuthLoaded(true));
    return () => window.removeEventListener("popstate", pop);
  }, [refreshUser]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const route = path.split("?")[0];
  const context = {
    user,
    setUser,
    refreshUser,
    authLoaded,
    navigate,
    notify,
    path,
  };
  const logout = async () => {
    try {
      await api("/auth/logout", {});
      setUser(null);
      navigate("/");
      notify("You’ve signed out. See you at the next one.");
    } catch (e) {
      notify(e.message, "error");
    }
  };
  return (
    <AppContext.Provider value={context}>
      <div className="site-shell">
        <header className="site-header">
          <div className="header-inner">
            <a
              className="logo"
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigate("/");
              }}
              aria-label="SeatWise home"
            >
              <span className="logo-symbol">
                <Asterisk size={31} strokeWidth={2.3} />
              </span>
              seatwise<span className="logo-dot">®</span>
            </a>
            <nav
              className={"main-nav " + (menu ? "open" : "")}
              aria-label="Main navigation"
            >
              <button
                className={
                  route === "/" || route.startsWith("/event/") ? "active" : ""
                }
                onClick={() => navigate("/")}
              >
                Discover
                <span />
              </button>
              <button
                className={route === "/tickets" ? "active" : ""}
                onClick={() => navigate("/tickets")}
              >
                My tickets
              </button>
              <button
                className={route === "/how-it-works" ? "active" : ""}
                onClick={() => navigate("/how-it-works")}
              >
                The SeatWise way
              </button>
              {user?.role === "admin" && (
                <button
                  className={route === "/admin" ? "active" : ""}
                  onClick={() => navigate("/admin")}
                >
                  Control room
                  <ArrowUpRight size={13} />
                </button>
              )}
            </nav>
            <div className="header-actions">
              <span className="location">
                <MapPin size={14} />
                Bengaluru
              </span>
              {user ? (
                <>
                  <button
                    className="wallet-chip"
                    onClick={() => navigate("/wallet")}
                    aria-label={`Demo wallet balance ${money(user.wallet)}`}
                  >
                    <Wallet size={16} />
                    <span>{money(user.wallet)}</span>
                    <span className="tiny-label">DEMO</span>
                  </button>
                  <button
                    className="avatar"
                    onClick={() => setMenu(!menu)}
                    aria-label="Account menu"
                  >
                    {user.name.charAt(0)}
                  </button>
                  <button
                    className="icon-button logout"
                    onClick={logout}
                    aria-label="Sign out"
                  >
                    <LogOut size={17} />
                  </button>
                </>
              ) : (
                <button
                  className="button button-small button-light"
                  onClick={() => navigate("/login")}
                >
                  Sign in
                  <ArrowUpRight size={15} />
                </button>
              )}
              <button
                className="icon-button mobile-menu"
                onClick={() => setMenu(!menu)}
                aria-label="Toggle navigation"
              >
                {menu ? <X /> : <Menu />}
              </button>
            </div>
          </div>
          {menu && user && (
            <div className="account-dropdown">
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
              <button onClick={() => navigate("/wallet")}>
                <Wallet size={16} />
                Demo wallet
              </button>
              <button onClick={() => navigate("/tickets")}>
                <Ticket size={16} />
                My tickets
              </button>
              {user.role === "admin" && (
                <button onClick={() => navigate("/admin")}>
                  <LayoutDashboard size={16} />
                  Control room
                </button>
              )}
              <button onClick={logout}>
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </header>
        <main>
          {route === "/login" || route === "/signup" ? (
            <AuthScreen signup={route === "/signup"} />
          ) : route.startsWith("/event/") ? (
            <Booking id={route.split("/")[2]} />
          ) : route === "/tickets" ? (
            <TicketsScreen />
          ) : route === "/wallet" ? (
            <WalletScreen />
          ) : route === "/admin" ? (
            <Admin />
          ) : route === "/how-it-works" ? (
            <HowScreen />
          ) : (
            <Home />
          )}
        </main>
        <footer className="site-footer">
          <div className="footer-top">
            <a
              className="logo"
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigate("/");
              }}
            >
              <span className="logo-symbol">
                <Asterisk size={25} />
              </span>
              seatwise<span className="logo-dot">®</span>
            </a>
            <span>Good nights start here.</span>
            <div>
              <button onClick={() => navigate("/how-it-works")}>
                How it works
              </button>
              <button
                onClick={() =>
                  navigate(
                    user?.role === "admin" ? "/admin" : "/login?next=/admin",
                  )
                }
              >
                For organisers
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} SeatWise. Made for being there.
            </span>
            <span>
              <ShieldCheck size={13} />
              Demo events & funds. Real reservations.
            </span>
            <span>Bengaluru, India ↗</span>
          </div>
        </footer>
      </div>
      {toast && (
        <div className={"toast " + toast.type} role="status" key={toast.id}>
          {toast.type === "error" ? (
            <AlertCircle size={19} />
          ) : (
            <Check size={19} />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
