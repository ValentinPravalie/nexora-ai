import { applySecurityHeaders, authenticateRequest } from "../lib/security.js";

const recentRequests = new Map();

export default async function handler(req, res) {
  applySecurityHeaders(res);
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Metodă nepermisă." }); }
  const user = await authenticateRequest(req, res, 10);
  if (!user) return;
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Serviciul vocal nu este configurat." });
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (recentRequests.get(ip) || []).filter(t => now - t < 60000);
  if (recent.length >= 12) return res.status(429).json({ error: "Ai generat prea multe răspunsuri vocale. Încearcă din nou peste un minut." });
  recent.push(now); recentRequests.set(ip, recent);
  try {
    const input = req.body && req.body.text;
    if (typeof input !== "string" || !input.trim() || input.length > 4096) return res.status(400).json({ error: "Textul pentru voce este invalid sau prea lung." });
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "marin", input: input.trim(), instructions: "Speak in Romanian (Romania). Use a steady, clear, simple assistant voice, slightly mechanical and neutral. Pronounce every word distinctly. Keep a constant pace, with no dramatic pauses, no expressive acting, and no rushed phrases.", speed: 1.0, response_format: "mp3" })
    });
    if (!response.ok) { const error = await response.json().catch(() => ({})); console.error("Speech API error:", response.status, error); return res.status(response.status >= 500 ? 502 : response.status).json({ error: error.error && error.error.message || "Nu am putut genera vocea." }); }
    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg"); res.setHeader("Content-Length", String(audio.length));
    return res.status(200).send(audio);
  } catch (error) { console.error("Speech endpoint error:", error.message); return res.status(500).json({ error: "A apărut o eroare la generarea vocii." }); }
}