export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodă nepermisă." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Serviciul vocal nu este configurat." });
  }

  try {
    const text = req.body?.text;
    if (typeof text !== "string" || !text.trim() || text.length > 3500) {
      return res.status(400).json({ error: "Textul pentru voce lipsește sau este prea lung." });
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: text.trim(),
        instructions: "Speak Romanian (Romania) naturally and fluently. Use a warm, friendly, human-like conversational voice. Speak clearly at a moderate pace, with natural pauses and expressive but restrained intonation. Pronounce Romanian names and diacritics correctly. Do not sound robotic or overly theatrical.",
        response_format: "mp3"
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI speech API error:", response.status, detail.slice(0, 500));
      return res.status(response.status >= 500 ? 502 : 400).json({
        error: "Nu am putut genera vocea acum. Încearcă din nou."
      });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audio.length);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(audio);
  } catch (error) {
    console.error("Speech endpoint error:", error.message);
    return res.status(500).json({ error: "Serviciul vocal a întâmpinat o eroare." });
  }
}
