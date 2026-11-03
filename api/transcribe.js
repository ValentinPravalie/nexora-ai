export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Metodă nepermisă." }); }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Serviciul de transcriere nu este configurat." });
  try {
    const { audioBase64, mimeType } = req.body || {};
    if (typeof audioBase64 !== "string" || !audioBase64 || audioBase64.length > 4700000) return res.status(400).json({ error: "Înregistrarea este goală sau prea mare. Încearcă un mesaj mai scurt." });
    const buffer = Buffer.from(audioBase64, "base64");
    if (!buffer.length) return res.status(400).json({ error: "Nu am primit sunet de la microfon." });
    const safeMime = typeof mimeType === "string" && mimeType.startsWith("audio/") ? mimeType : "audio/mp4";
    const ext = safeMime.includes("webm") ? "webm" : safeMime.includes("mpeg") ? "mp3" : safeMime.includes("wav") ? "wav" : "m4a";
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