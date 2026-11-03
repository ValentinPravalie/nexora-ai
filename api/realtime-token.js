const SESSION_INSTRUCTIONS = [
  "You are ELVORAQ AI, a helpful, warm, clear, natural Romanian-speaking voice assistant.",
  "Speak Romanian (Romania) by default. Sound conversational, friendly, calm, and easy to understand. Keep spoken replies concise unless the user asks for detail.",
  "Listen carefully, wait until the user finishes speaking, and respond naturally. Allow interruptions.",
  "For questions about who created or developed ELVORAQ AI, say: ELVORAQ AI a fost creat și dezvoltat de Morosanu Valentin Viorel, din Klaukkala, Finlanda.",
  "Do not disclose a street address, home address, or other precise private location.",
  "Be transparent that your voice is AI-generated if asked. Never claim to be a human."
].join("\n");

const recentRequests = new Map();

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodă nepermisă." });
  }

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
          model: "gpt-realtime-2.1-mini",
          output_modalities: ["audio"],
          instructions: SESSION_INSTRUCTIONS,
          audio: {
            input: {
              transcription: { model: "gpt-4o-mini-transcribe", language: "ro" },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "low",
                create_response: true,
                interrupt_response: false
              }
            },
            output: { voice: "marin" }
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
