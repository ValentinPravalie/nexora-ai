import { applySecurityHeaders, authenticateRequest } from "../lib/security.js";

export const config = { api: { bodyParser: { sizeLimit: "4.5mb" } } };

export default async function handler(req, res) {
  applySecurityHeaders(res);
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Metodă nepermisă." }); }
  const user = await authenticateRequest(req, res, 8);
  if (!user) return;
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Serviciul de transcriere nu este configurat." });
  try {
    const { audioBase64, mimeType } = req.body || {};
    if (typeof audioBase64 !== "string" || !audioBase64 || audioBase64.length > 4200000) return res.status(400).json({ error: "Înregistrarea este goală sau prea mare. Încearcă un mesaj mai scurt." });
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) return res.status(400).json({ error: "Înregistrarea audio nu are un format valid." });
    const buffer = Buffer.from(audioBase64, "base64");
    if (!buffer.length) return res.status(400).json({ error: "Nu am primit sunet de la microfon." });
    const rawMime = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
    const safeMime = rawMime.split(";")[0].trim();
    const allowedMime = ["audio/mp4", "audio/m4a", "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-wav"];
    if (!allowedMime.includes(safeMime)) return res.status(400).json({ error: "Formatul înregistrării audio nu este acceptat. Încearcă din nou din Chrome sau Edge." });
    const ext = safeMime === "audio/webm" ? "webm" : safeMime === "audio/ogg" ? "ogg" : safeMime === "audio/mpeg" ? "mp3" : safeMime.includes("wav") ? "wav" : "m4a";
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: safeMime }), "recording." + ext);
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("language", "ro");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY },
      body: form
    });
    const data = await response.json();
    if (!response.ok) { console.error("Transcription API error:", response.status, data); return res.status(response.status >= 500 ? 502 : 400).json({ error: data.error && data.error.message || "Nu am putut înțelege înregistrarea." }); }
    const transcript = String(data.text || "").trim();
    if (!transcript) return res.status(422).json({ error: "Nu am auzit cuvinte. Încearcă din nou, mai aproape de microfon." });
    return res.status(200).json({ text: transcript });
  } catch (error) { console.error("Transcription endpoint error:", error); return res.status(500).json({ error: "A apărut o problemă la procesarea înregistrării." }); }
}