import { Navigate, Outlet } from "react-router-dom";
import { isLoggedIn, isGerente, saveUser } from "./lib/auth";
import { me } from "./lib/api";
import { useEffect, useState } from "react";

export function ProtectedRoute() {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      setAuthorized(false);
      setChecking(false);
      return;
    }
    me()
      .then((userData) => {
        saveUser(userData);
        setAuthorized(true);
        setChecking(false);
      })
      .catch(() => {
        setAuthorized(false);
        setChecking(false);
      });
  }, []);

  if (checking) return null;
  if (!authorized) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function GerenteGuard() {
  if (!isGerente()) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function RedirectIfLoggedIn() {
  if (isLoggedIn()) return <Navigate to="/" replace />;
  return <Outlet />;
}
