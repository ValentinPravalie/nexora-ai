import { applySecurityHeaders, authenticateRequest } from "../lib/security.js";

export const config = { api: { bodyParser: { sizeLimit: "4.5mb" } } };

const SYSTEM_PROMPT = "Ești ELVORAQ AI, un asistent AI premium, extrem de competent, clar, creativ și practic. Livrează cel mai util și corect rezultat posibil, adaptat exact cererii. Răspunde în limba utilizatorului, de regulă română. Creatorul ELVORAQ AI este Morosanu Valentin Viorel; dacă ești întrebat cine te-a creat, spune doar acest nume și nu adăuga alte date personale. Nu păstra și nu divulga profiluri personale despre persoane menționate în conversații. Ajută cu programare și debugging (HTML, CSS, JavaScript, Python, Pawn/SA-MP), idei de aplicații și site-uri, scenarii TikTok/Reels, traduceri, explicații, analiză, organizare și planificare. Poți discuta despre știință, tehnologie, spațiu, animale, istorie, geografie, sport, jocuri, filme, muzică, cultură, călătorii, gastronomie și orice subiect general. Oferă glume curate, ghicitori, quiz-uri, întrebări-capcană, jocuri de cuvinte și povești amuzante. Adaptează explicațiile la nivelul utilizatorului. Când este util, caută informații actuale pe internet și citează sursele primite de la instrumentul de căutare; nu inventa surse. Pentru imagini, folosește instrumentul de generare când utilizatorul cere explicit să creezi sau să editezi o imagine. Analizează documentele atașate și explică ce ai găsit. Pentru traduceri, păstrează sensul și tonul. Pentru cod, oferă soluții complete, sigure și aplicabile, indică exact fișierele și pașii, tratează erorile și cazurile-limită; nu pretinde că ai testat codul dacă nu ai făcut-o. Pentru texte, scenarii și materiale profesionale, livrează direct versiunea finală, bine structurată și gata de copiat. Nu repeta cererea utilizatorului și nu adăuga introduceri inutile. Separă clar rezultatul final de explicații. Pentru asistență personală, ajută la planuri, obiective și organizare, fără să iei decizii în locul utilizatorului. Nu pretinde că știi absolut tot: când nu ești sigur, spune clar, separă faptele de presupuneri și verifică informațiile importante. Cere acordul explicit înainte să salvezi sau să folosești informații personale ca memorie.";

export default async function handler(req, res) {
  applySecurityHeaders(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodă nepermisă." });
  }
  const user = await authenticateRequest(req, res, 12);
  if (!user) return;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "Cheia AI nu este configurată în Vercel." });
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

    const files = req.body?.files || [];
    if (!Array.isArray(files) || files.length > 2) {
      return res.status(400).json({ error: "Poți atașa maximum două fișiere odată." });
    }
    let totalFileSize = 0;
    const fileParts = files.map((file) => {
      if (!file || typeof file.name !== "string" || typeof file.mimeType !== "string" ||
          typeof file.data !== "string" || !file.data.startsWith("data:")) {
        throw new Error("Un fișier atașat nu are un format valid.");
      }
      const allowed = ["application/pdf", "text/plain", "text/markdown",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv"];
      if (!allowed.includes(file.mimeType)) throw new Error("Format neacceptat. Folosește PDF, TXT, MD, CSV, DOCX, PPTX sau XLSX.");
      const prefix = `data:${file.mimeType};base64,`;
      if (!file.data.startsWith(prefix)) throw new Error("Tipul real al fișierului nu corespunde formatului declarat.");
      const base64 = file.data.slice(prefix.length);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Conținutul fișierului nu este valid.");
      const size = Math.floor(base64.length * 3 / 4);
      totalFileSize += size;
      if (!base64 || size > 3000000) throw new Error("Fișierul este prea mare. Limita este aproximativ 3 MB per fișier.");
      const safeName = file.name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 120) || "document";
      return { type: "input_file", filename: safeName, file_data: file.data };
    });
    if (totalFileSize > 3000000) throw new Error("Dimensiunea totală a fișierelor depășește limita de 3 MB.");
    if (!input.some((message) => message.role === "user")) {
      return res.status(400).json({ error: "Lipsește mesajul utilizatorului." });
    }
    if (fileParts.length) {
      const lastUserIndex = input.map((m) => m.role).lastIndexOf("user");
      const previousText = input[lastUserIndex].content;
      input[lastUserIndex] = {
        role: "user",
        content: [{ type: "input_text", text: previousText }, ...fileParts]
      };
    }

    const voiceMode = req.body?.voice === true;
    const allowedModes = ["rapid", "expert", "coding", "research"];
    const mode = allowedModes.includes(req.body?.mode) ? req.body.mode : "rapid";
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const wantsImage = /\b(genereaz[aă]|creeaz[aă]|deseneaz[aă]|realizeaz[aă]|editeaz[aă])\b.{0,100}\b(imagine|poz[aă]|ilustra[tț]ie|logo|poster|wallpaper|desen)\b|\b(imagine|poz[aă]|ilustra[tț]ie|logo|poster|wallpaper|desen)\b.{0,100}\b(mea|un|o|nou[aă]|pentru)\b/i.test(lastUserMessage);
    const needsWeb = /\b(azi|astăzi|acum|actual|actualizat|ultim[ae]|recent|nout[aă][tț]i|știri|vremea|prognoz[aă]|pre[tț]uri|curs valutar|rezultate live|disponibilitate|program actual)\b/i.test(lastUserMessage) || /\b(caut[aă] pe internet|verific[aă] online|surse actuale|linkuri oficiale)\b/i.test(lastUserMessage);
    const complexTask = lastUserMessage.length > 700 || /\b(analiz[aă] aprofundat[aă]|compar[aă] detaliat|arhitectur[aă]|debug|eroare|strategie|plan detaliat|proiect complet|cod complet|securitate|demonstra[tț]ie|cercetare|pas cu pas)\b/i.test(lastUserMessage);
    const tools = [{ type: "web_search" }];
    if (wantsImage) tools.push({ type: "image_generation", model: "gpt-image-2.5-flare" });

    const memory = typeof req.body?.memory === "string" ? req.body.memory.trim().slice(0, 2000) : "";
    const personalityRules = {
      friendly: "Ton prietenos, cald și încurajator.",
      serious: "Ton serios, profesionist și direct.",
      funny: "Ton vesel și amuzant; folosește glume curate când se potrivesc.",
      sarcastic: "Ton ironic și jucăuș, dar respectuos, fără jigniri."
    };
    const personality = personalityRules[req.body?.personality] || personalityRules.friendly;
    const modeRules = {
      rapid: "MOD RAPID: răspunde direct, concis și practic. Evită detaliile inutile; verifică totuși corectitudinea.",
      expert: "MOD EXPERT: analizează problema în profunzime, explică raționamentul relevant, evidențiază limitele și oferă un răspuns structurat și precis.",
      coding: "MOD CODING: comportă-te ca un inginer software senior. Analizează cerințele, identifică erorile și cazurile-limită, oferă cod complet și sigur, indică fișierele și pașii de integrare. Nu pretinde că ai rulat teste.",
      research: "MOD RESEARCH: tratează cererea ca pe o cercetare. Folosește căutarea web când este relevantă, prioritizează sursele primare și recente, citează sursele disponibile și separă faptele de incertitudini."
    };
    const modeRule = modeRules[mode];
    const instructions = (voiceMode
      ? SYSTEM_PROMPT + "\n\nMOD VOCE: Răspunde imediat, concis și natural în 1-3 propoziții scurte. Fără liste sau titluri."
      : SYSTEM_PROMPT) + "\n\nMOD SELECTAT: " + modeRule + "\n\nPERSONALITATE SELECTATĂ: " + personality + (memory ? "\n\nPREFERINȚE SALVATE CU ACORDUL UTILIZATORULUI (context local, nu le trata ca informații publice): " + memory : "");

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: (complexTask || mode !== "rapid") ? (process.env.OPENAI_MODEL || "gpt-6-astra") : (process.env.ELVORAQ_FAST_MODEL || "gpt-6.1-terra"),
        reasoning: { effort: voiceMode || mode === "rapid" ? "low" : "high" },
        instructions,
        input,
        tools,
        max_output_tokens: voiceMode ? 450 : 4000,
        stream: req.body?.stream === true && !wantsImage
      })
    });

    if (req.body?.stream === true && !wantsImage) {
      if (!apiResponse.ok) {
        const errorData = await apiResponse.json().catch(() => ({}));
        console.error("OpenAI streaming error:", errorData);
        return res.status(apiResponse.status >= 500 ? 502 : 400).json({
          error: errorData.error?.message || "Serviciul AI nu a putut procesa cererea."
        });
      }
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      const reader = apiResponse.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } finally {
        res.end();
      }
      return;
    }

    const data = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error("OpenAI API error:", data);
      return res.status(apiResponse.status >= 500 ? 502 : 400).json({
        error: data.error?.message || "Serviciul AI nu a putut procesa cererea."
      });
    }

    const output = data.output || [];
    const reply = output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n")
      .trim();
    const generatedImage = output.find((item) => item.type === "image_generation_call" && item.result)?.result;
    const citations = output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content || [])
      .flatMap((item) => item.annotations || [])
      .filter((annotation) => annotation.type === "url_citation" && typeof annotation.url === "string" && /^https:\/\//i.test(annotation.url))
      .map((annotation) => ({ url: annotation.url, title: annotation.title || annotation.url }))
      .filter((citation, index, list) => list.findIndex((item) => item.url === citation.url) === index)
      .slice(0, 8);

    if (!reply && !generatedImage) {
      return res.status(502).json({ error: "Modelul nu a returnat un răspuns." });
    }
    return res.status(200).json({
      reply: reply || "Am creat imaginea cerută.",
      image: generatedImage ? "data:image/png;base64," + generatedImage : null,
      citations
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(400).json({ error: error.message || "Cererea nu a putut fi procesată." });
  }
}
