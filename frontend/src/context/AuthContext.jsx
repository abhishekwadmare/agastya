import { createContext, useContext, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { GOOGLE_CLIENT_ID } from "../config.js";

const AuthContext = createContext(null);

const GOOGLE_POLL_INTERVAL_MS = 100;
const GOOGLE_POLL_TIMEOUT_MS = 10000;

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

export function AuthProvider({ children }) {
  const [idToken, setIdToken] = useState(null);
  const [email, setEmail] = useState(null);

  useEffect(
    () =>
      waitForGoogle(() => {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            // response.credential is the Google ID token (JWT). We don't
            // trust it client-side - the Worker re-verifies it server-side
            // on every write. Client-side decode here is only for display.
            setIdToken(response.credential);
            try {
              const payload = JSON.parse(atob(response.credential.split(".")[1]));
              setEmail(payload.email);
            } catch {
              setEmail(null);
            }
          },
        });
      }),
    []
  );

  function signOut() {
    setIdToken(null);
    setEmail(null);
    window.google?.accounts.id.disableAutoSelect();
  }

  // Shared guard for every admin write action across the app (Jobs,
  // Companies, Alerts): if not signed in, report it via the caller's own
  // status state and best-effort trigger Google's One Tap prompt, rather
  // than letting the request hit the Worker and fail with a raw error.
  function requireSignIn(setStatus) {
    if (idToken) return true;
    setStatus({
      type: "error",
      text: "Sign in with Google (top-right) to make changes - only the site owner's account is authorized.",
    });
    window.google?.accounts.id.prompt();
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
// when AuthProvider's own effect first ran.
export function GoogleSignInButton() {
  const ref = useRef(null);

  useEffect(
    () =>
      waitForGoogle(() => {
        if (!ref.current) return;
        window.google.accounts.id.renderButton(ref.current, {
          theme: "outline",
          size: "medium",
          text: "signin_with",
        });
      }),
    []
  );

  return <div ref={ref} />;
}
