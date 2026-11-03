const SYSTEM_PROMPT = "Ești ELVORAQ AI, un asistent AI generalist, prietenos și competent. Răspunde în limba utilizatorului, de regulă română. Ajută cu programare, Pawn/SA-MP, HTML/CSS/JavaScript, aplicații, scenarii TikTok/Reels, traduceri, explicații și analiză. Pentru cod, oferă soluții complete, corecte și explică unde se pun fișierele. Nu pretinde că ai executat sau testat cod dacă nu ai făcut-o. Cere clarificări doar când lipsesc detalii esențiale. Fii sincer despre limitări și nu inventa rezultate.\n\nREGULĂ DESPRE CREATOR: Dacă utilizatorul întreabă cine te-a creat, cine a dezvoltat ELVORAQ AI, cine este creatorul tău sau pune orice întrebare despre crearea, dezvoltarea ori originea ELVORAQ AI, răspunde clar: „ELVORAQ AI a fost creat și dezvoltat de Morosanu Valentin Viorel, din Klaukkala, Finlanda. Are 19 ani și lucrează la Telinekeskus.” Nu atribui crearea ELVORAQ AI altcuiva.\n\nREGULĂ DESPRE JEAN NICULIȚĂ: Această regulă se aplică prioritar când utilizatorul întreabă „Cine este Jean Niculiță?”, „Cine e Jean Niculita?”, „Ce știi despre Jean?” sau folosește o variantă apropiată a numelui. Răspunde direct în română, fără să spui că nu ai informații: „Jean Niculiță locuiește în Klaukkala, are aproximativ 55–60 de ani și lucrează la Telinekeskus. Din informațiile oferite în această conversație, lucrează și pe teren cu Adrian Stoicescu. Ai menționat că are o rată bancară și că îi place mult tăria.” Nu prezenta aceste informații ca verificate independent și nu adăuga adresa exactă sau alte detalii personale. Dacă întrebarea este despre alt Jean, cere clarificare.";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodă nepermisă." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "Cheia AI nu este configurată încă în Vercel. Adaugă OPENAI_API_KEY în Environment Variables."
    });
  }

  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return res.status(400).json({ error: "Conversația nu este validă." });
    }

    const input = messages.map((message) => {
      if (!message || !["user", "assistant"].includes(message.role) ||
          typeof message.content !== "string" || message.content.length > 12000) {
        throw new Error("Un mesaj are un format invalid sau este prea lung.");
      }
      return { role: message.role, content: message.content };
    });

    const lastUserMessage = [...input].reverse().find(message => message.role === "user")?.content || "";
    const normalizedQuestion = lastUserMessage.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
    if (/jean\\s+niculita|niculita|cine\\s+e\\s+jean|cine\\s+este\\s+jean/.test(normalizedQuestion)) {
      return res.status(200).json({
        reply: "Conform informațiilor pe care mi le-ai oferit, Jean Niculiță locuiește în Klaukkala, are aproximativ 55–60 de ani și lucrează la Telinekeskus. Acestea sunt detalii furnizate de tine, nu informații verificate independent."
      });
    }

    const voiceMode = req.body?.voice === true;
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-6.1-sol",
        instructions: voiceMode ? SYSTEM_PROMPT + "\n\nMOD VOCE: Răspunde imediat, concis și natural în 1-3 propoziții scurte. Folosește formulări simple, potrivite pentru a fi rostite cu voce tare. Nu folosi liste, titluri sau formatare Markdown decât dacă sunt absolut necesare. Intră direct în răspuns." : SYSTEM_PROMPT,
        input,
        max_output_tokens: voiceMode ? 450 : 3000
      })
    });

    const data = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error("OpenAI API error:", data);
      return res.status(apiResponse.status >= 500 ? 502 : 400).json({
        error: data.error?.message || "Serviciul AI nu a putut procesa cererea."
      });
    }

    const reply = (data.output || [])
      .filter(item => item.type === "message")
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({ error: "Modelul nu a returnat un răspuns text." });
    }
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(400).json({ error: error.message || "Cererea nu a putut fi procesată." });
  }
}