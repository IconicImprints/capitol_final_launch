import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY || "";
const host = import.meta.env.VITE_POSTHOG_HOST || "";

let initialized = false;

export const isPostHogConfigured = Boolean(key && host);

export function initPostHog() {
  if (initialized) return posthog;
  if (!isPostHogConfigured) return null;
  try {
    posthog.init(key, {
      api_host: host,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      persistence: "localStorage",
      loaded: (ph) => {
        try {
          ph.capture("capitol_app_loaded");
        } catch {}
      },
    });
    initialized = true;
    return posthog;
  } catch {
    return null;
  }
}

export function trackEvent(event, properties) {
  if (!initialized || !isPostHogConfigured) return;
  try {
    posthog.capture(event, properties);
  } catch {}
}

export function identifyUser(uid, traits = {}) {
  if (!initialized || !isPostHogConfigured || !uid) return;
  try {
    posthog.identify(String(uid), traits);
  } catch {}
}

export function resetAnalytics() {
  if (!initialized || !isPostHogConfigured) return;
  try {
    posthog.reset();
  } catch {}
}

export function getPostHog() {
  return initialized ? posthog : null;
}
