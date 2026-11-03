const requestBuckets = new Map();

export function applySecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
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
    console.error("Persistent rate limit is not active. Apply supabase/security.sql; temporary in-memory limit remains active.");

    const now = Date.now();
    const bucketKey = user.id;
    const recent = (requestBuckets.get(bucketKey) || []).filter((time) => now - time < 60_000);
    if (recent.length >= limit) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "Ai trimis prea multe solicitări. Așteaptă un minut și încearcă din nou." });
      return null;
    }
    recent.push(now);
    requestBuckets.set(bucketKey, recent);
    if (requestBuckets.size > 5000) {
      for (const [key, values] of requestBuckets) {
        if (!values.length || now - values[values.length - 1] > 120_000) requestBuckets.delete(key);
      }
    }
    return user;
  } catch (error) {
    console.error("Authentication verification failed:", error.message);
    res.status(503).json({ error: "Nu am putut verifica sesiunea. Încearcă din nou." });
    return null;
  }
}
