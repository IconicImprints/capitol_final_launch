import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "../App.jsx";
import { initPostHog } from "./lib/posthog.js";
import { verifySupabaseConnection } from "./lib/supabase.js";

initPostHog();

// Non-blocking connectivity check — logs status only, never secrets.
verifySupabaseConnection().then((result) => {
  try {
    if (import.meta.env.DEV) {
      console.info("[capitol] supabase:", result.ok ? "connected" : `unavailable (${result.reason})`);
    }
  } catch {}
}).catch(() => {});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>
);
