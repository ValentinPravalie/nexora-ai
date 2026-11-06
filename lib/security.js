import { createHmac } from "node:crypto";

export function applySecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()");
}

export function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return false;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers.host || "").toLowerCase();
    const allowedHosts = new Set([host]);
    if (process.env.VERCEL_URL) allowedHosts.add(process.env.VERCEL_URL.toLowerCase());
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) allowedHosts.add(process.env.VERCEL_PROJECT_PRODUCTION_URL.toLowerCase());
    const hostname = parsed.host.toLowerCase();
    return (parsed.protocol === "https:" || hostname.startsWith("localhost:") || hostname.startsWith("127.0.0.1:")) && allowedHosts.has(hostname);
  } catch {
    return false;
  }
}

export async function authenticateRequest(req, res, limit = 12) {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "Originea solicitării nu este permisă." });
    return null;
  }

  const authorization = req.headers.authorization || "";
  const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match) {
    res.status(401).json({ error: "Trebuie să te conectezi pentru a folosi ELVORAQ AI." });
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(503).json({ error: "Autentificarea nu este configurată pe server." });
    return null;
  }

  try {
    const verification = await fetch(supabaseUrl.replace(/\/$/, "") + "/auth/v1/user", {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: "Bearer " + match[1]
      }
    });
    if (!verification.ok) {
      res.status(401).json({ error: "Sesiunea a expirat. Conectează-te din nou." });
      return null;
    }
    const user = await verification.json();
    if (!user || typeof user.id !== "string" || user.aud !== "authenticated") {
      res.status(401).json({ error: "Sesiunea nu este validă." });
      return null;
    }
    if (!user.email_confirmed_at && !user.phone_confirmed_at) {
      res.status(403).json({ error: "Confirmă adresa de e-mail înainte să folosești serviciul." });
      return null;
    }

    const rateResponse = await fetch(supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/consume_api_rate_limit", {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: "Bearer " + match[1],
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_limit: limit, p_bucket: String(req.url || "api").split("?")[0].slice(0, 80) })
    });
    if (rateResponse.ok) {
      const allowed = await rateResponse.json();
      if (allowed !== true) {
        res.setHeader("Retry-After", "60");
        res.status(429).json({ error: "Ai trimis prea multe solicitări. Așteaptă un minut și încearcă din nou." });
        return null;
      }
      return user;
    }
    console.error("Persistent rate limit unavailable; request rejected to prevent an unmetered API path.");
    res.status(503).json({ error: "Protecția temporară a serviciului nu este disponibilă. Încearcă din nou mai târziu." });
    return null;
  } catch (error) {
    console.error("Authentication verification failed:", error.message);
    res.status(503).json({ error: "Nu am putut verifica sesiunea. Încearcă din nou." });
    return null;
  }
}


export async function consumeGuestDailyMessage(req, res, limit = 10) {
  const secret = process.env.ELVORAQ_GUEST_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!secret || secret.length < 32 || !supabaseUrl || !supabaseKey) {
    res.status(503).json({ error: "Modul gratuit nu este configurat complet. Încearcă din nou mai târziu." });
    return null;
  }

  const forwarded = req.headers["x-vercel-forwarded-for"] ||
    req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "";
  const ip = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded))
    .split(",")[0].trim().slice(0, 100);
  if (!ip) {
    res.status(503).json({ error: "Nu am putut verifica limita zilnică. Încearcă din nou." });
    return null;
  }

  const userAgent = String(req.headers["user-agent"] || "").slice(0, 300);
  const fingerprint = createHmac("sha256", secret).update(ip + "|" + userAgent).digest("hex");
  try {
    const response = await fetch(supabaseUrl.replace(/\/+$/, "") + "/rest/v1/rpc/consume_guest_daily_message", {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: "Bearer " + supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_fingerprint_hash: fingerprint, p_limit: limit })
    });
    if (!response.ok) {
      console.error("Guest quota RPC failed:", response.status);
      res.status(503).json({ error: "Nu am putut verifica limita zilnică. Încearcă din nou mai târziu." });
      return null;
    }
    const remaining = await response.json();
    if (!Number.isInteger(remaining) || remaining < 0) {
      res.setHeader("Retry-After", "3600");
      res.status(429).json({ error: "Ai folosit cele 10 mesaje gratuite de astăzi. Revino mâine sau conectează-te pentru funcțiile contului." });
      return null;
    }
    res.setHeader("X-Guest-Limit", String(limit));
    res.setHeader("X-Guest-Remaining", String(remaining));
    return remaining;
  } catch (error) {
    console.error("Guest quota verification failed:", error.message);
    res.status(503).json({ error: "Protecția pentru vizitatori nu este disponibilă. Încearcă din nou." });
    return null;
  }
}
