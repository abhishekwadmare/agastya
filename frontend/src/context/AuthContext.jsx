import { createContext, useContext, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { GOOGLE_CLIENT_ID } from "../config.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [idToken, setIdToken] = useState(null);
  const [email, setEmail] = useState(null);

  useEffect(() => {
    if (!window.google) return;

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
  }, []);

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

  useEffect(() => {
    if (!window.google || !ref.current) return;
    window.google.accounts.id.renderButton(ref.current, {
      theme: "outline",
      size: "medium",
      text: "signin_with",
    });
  }, []);

  return <div ref={ref} />;
}
