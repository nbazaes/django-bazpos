import { useEffect, useState } from "react";
import { API_BASE, STORE_NAME as FALLBACK_STORE_NAME } from "./config";

let cached = FALLBACK_STORE_NAME;
let fetchPromise = null;

export function getStoreName() {
  return cached;
}

export function initStoreName() {
  if (!fetchPromise) {
    fetchPromise = fetch(`${API_BASE}/store-name/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && data.name) cached = data.name;
      })
      .catch(() => {})
      .finally(() => {
        fetchPromise = null;
      });
  }
  return fetchPromise;
}

export function useStoreName() {
  const [name, setName] = useState(getStoreName());
  useEffect(() => {
    initStoreName().then(() => setName(getStoreName()));
  }, []);
  return name;
}