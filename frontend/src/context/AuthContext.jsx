import { createContext, useContext, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { GOOGLE_CLIENT_ID } from "../config.js";

const AuthContext = createContext(null);

const GOOGLE_POLL_INTERVAL_MS = 100;
const GOOGLE_POLL_TIMEOUT_MS = 10000;

const ID_TOKEN_STORAGE_KEY = "agastya:googleIdToken";
const EXPIRY_SKEW_MS = 5000;

const BUTTON_RENDER_CHECK_MS = 500;
const BUTTON_RENDER_MAX_RETRIES = 2;

// The Google Identity Services script tag loads with async/defer, so
// there's no guarantee window.google exists yet when a component using
// it first mounts - on a slower connection it very often doesn't. A
// one-time check-and-bail (as this used to be) means sign-in silently
// never initializes for that whole page load. Poll instead, and give up
// after a reasonable timeout if the script genuinely failed to load
// (network block, ad blocker, etc).
function waitForGoogle(onReady) {
  let cancelled = false;
  let elapsed = 0;

  function tick() {
    if (cancelled) return;
    if (window.google?.accounts?.id) {
      onReady();
      return;
    }
    elapsed += GOOGLE_POLL_INTERVAL_MS;
    if (elapsed >= GOOGLE_POLL_TIMEOUT_MS) {
      console.warn("Google Identity Services script did not load in time.");
      return;
    }
    setTimeout(tick, GOOGLE_POLL_INTERVAL_MS);
  }

  tick();
  return () => {
    cancelled = true;
  };
}

// JWTs are base64url-encoded (`-`/`_`, no padding) - plain atob() throws
// on payloads containing those characters, so normalize before decoding.
function decodeIdToken(token) {
  try {
    const payloadSegment = token.split(".")[1];
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    if (typeof payload.exp !== "number") return null;
    return { email: payload.email ?? null, exp: payload.exp };
  } catch {
    return null;
  }
}

function isTokenValid(token) {
  const claims = decodeIdToken(token);
  return !!claims && claims.exp * 1000 - EXPIRY_SKEW_MS > Date.now();
}

// Fixes #1 - restore a still-valid session from localStorage instead of
// always starting signed-out on a fresh page load. The ID token is
// already treated as untrusted client-side (the Worker re-verifies it
// server-side on every write), so persisting it here doesn't introduce
// a new trust boundary.
function readPersistedSession() {
  const token = localStorage.getItem(ID_TOKEN_STORAGE_KEY);
  if (!token) return null;
  const claims = decodeIdToken(token);
  if (!claims || claims.exp * 1000 - EXPIRY_SKEW_MS <= Date.now()) {
    localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
    return null;
  }
  return { idToken: token, email: claims.email };
}

export function AuthProvider({ children }) {
  const [idToken, setIdToken] = useState(() => readPersistedSession()?.idToken ?? null);
  const [email, setEmail] = useState(() => readPersistedSession()?.email ?? null);

  useEffect(
    () =>
      waitForGoogle(() => {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          // Fixes #2 - force the classic iframe button/prompt path
          // instead of GIS's FedCM-backed one, which we observed abort
          // (net::ERR_ABORTED on gsi/button?...&is_fedcm_supported=true)
          // once an active Google session already exists in the browser.
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: false,
          use_fedcm_for_button: false,
          callback: (response) => {
            // response.credential is the Google ID token (JWT). We don't
            // trust it client-side - the Worker re-verifies it server-side
            // on every write. Client-side decode here is only for display.
            setIdToken(response.credential);
            const claims = decodeIdToken(response.credential);
            setEmail(claims?.email ?? null);
            localStorage.setItem(ID_TOKEN_STORAGE_KEY, response.credential);
          },
        });
      }),
    []
  );

  // Auto-expire while the tab stays open, so the UI doesn't keep
  // claiming "signed in" past the token's actual expiry.
  useEffect(() => {
    if (!idToken) return undefined;
    const claims = decodeIdToken(idToken);
    if (!claims) return undefined;

    const msRemaining = claims.exp * 1000 - EXPIRY_SKEW_MS - Date.now();
    if (msRemaining <= 0) {
      setIdToken(null);
      setEmail(null);
      localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
      return undefined;
    }

    const timer = setTimeout(() => {
      setIdToken(null);
      setEmail(null);
      localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
    }, msRemaining);
    return () => clearTimeout(timer);
  }, [idToken]);

  function signOut() {
    setIdToken(null);
    setEmail(null);
    localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
    window.google?.accounts?.id?.disableAutoSelect();
  }

  // Shared guard for every admin write action across the app (Jobs,
  // Companies, Alerts): if not signed in, report it via the caller's own
  // status state and best-effort trigger Google's One Tap prompt, rather
  // than letting the request hit the Worker and fail with a raw error.
  function requireSignIn(setStatus) {
    if (idToken && isTokenValid(idToken)) return true;
    setStatus({
      type: "error",
      text: "Sign in with Google (top-right) to make changes.",
    });
    window.google?.accounts?.id?.prompt();
    return false;
  }

  return (
    <AuthContext.Provider value={{ idToken, email, signOut, requireSignIn }}>
      {children}
    </AuthContext.Provider>
  );
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// The dashboard navbar remounts on every page navigation (each layout
// page renders its own <DashboardNavbar>), which destroys and recreates
// the DOM node the sign-in button lives in. renderButton() has to be
// called again on every mount of *this* node, not once globally, or the
// button only ever shows up on whichever page happened to be mounted
// when AuthProvider's own effect first ran. It's only ever mounted when
// idToken is falsy (DashboardNavbar's ternary), so a restored, still-
// valid persisted session skips this component entirely.
export function GoogleSignInButton() {
  const ref = useRef(null);

  useEffect(() => {
    let retryTimer;

    function attemptRender(retriesLeft) {
      if (!ref.current) return;
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "medium",
        text: "signin_with",
      });
      // Fixes #2 - defensive check that the button iframe actually
      // landed in the DOM, regardless of whether the opt-out flags
      // above are honored. Retries a couple times before giving up.
      retryTimer = setTimeout(() => {
        if (ref.current && ref.current.childElementCount === 0 && retriesLeft > 0) {
          console.warn("Google sign-in button did not render, retrying...");
          attemptRender(retriesLeft - 1);
        } else if (ref.current && ref.current.childElementCount === 0) {
          console.warn("Google sign-in button failed to render after retries.");
        }
      }, BUTTON_RENDER_CHECK_MS);
    }

    const cancelPoll = waitForGoogle(() => attemptRender(BUTTON_RENDER_MAX_RETRIES));

    return () => {
      cancelPoll();
      clearTimeout(retryTimer);
    };
  }, []);

  return <div ref={ref} />;
}
