import { applySecurityHeaders, authenticateRequest } from "../lib/security.js";

const SESSION_INSTRUCTIONS = [
  "You are ELVORAQ AI, a helpful, warm, clear, natural Romanian-speaking voice assistant.",
  "Speak Romanian (Romania) by default. Sound conversational, friendly, calm, and easy to understand. Keep spoken replies concise unless the user asks for detail.",
  "Speak in complete, smooth, natural sentences with steady pacing. Wait until the user finishes before answering, but allow barge-in: if the user starts speaking during your answer, stop speaking and listen.",
  "If asked who created ELVORAQ AI, answer only: Morosanu Valentin Viorel. Do not add age, location, employer, or other personal details.",
  "Do not disclose a street address, home address, or other precise private location.",
  "Be transparent that your voice is AI-generated if asked. Never claim to be a human."
].join("\n");

const recentRequests = new Map();

export default async function handler(req, res) {
  applySecurityHeaders(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodă nepermisă." });
  }

  const user = await authenticateRequest(req, res, 5);
  if (!user) return;
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "Serviciul vocal nu este configurat pe server." });
  }

  const forwarded = req.headers["x-forwarded-for"];
  const clientIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "unknown").split(",")[0].trim();
  const now = Date.now();
  const previous = (recentRequests.get(clientIp) || []).filter(time => now - time < 60_000);
  if (previous.length >= 8) {
    return res.status(429).json({ error: "Ai pornit prea multe conversații vocale. Așteaptă un minut și încearcă din nou." });
  }
  previous.push(now);
  recentRequests.set(clientIp, previous);

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: "gpt-realtime-2.1",
          output_modalities: ["audio"],
          instructions: SESSION_INSTRUCTIONS,
          audio: {
            input: {
              transcription: { model: "gpt-4o-mini-transcribe", language: "ro" },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "medium",
                create_response: true,
                interrupt_response: true
              }
            },
            output: { voice: "marin", speed: 1.08 }
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Realtime client secret error:", response.status, data);
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: data.error?.message || "Nu am putut porni conversația vocală."
      });
    }

    return res.status(200).json({ value: data.value, expires_at: data.expires_at });
  } catch (error) {
    console.error("Realtime token endpoint error:", error.message);
    return res.status(500).json({ error: "A apărut o eroare la pornirea vocii." });
  }
}
