const MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function json(res, status, body) {
  res.status(status).json(body);
}

function imagePart(dataUrl) {
  const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Format d'image non reconnu.");
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

async function callGemini(contents, responseMimeType = null, maxOutputTokens = 7000) {
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens
    }
  };
  if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error?.message || `Erreur Gemini (${response.status}).`;
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim();
  if (!text) throw new Error("Gemini n'a renvoyé aucun texte.");
  return text;
}

function buildRevisionPrompt(action) {
  if (action === "course") return `Tu es OEA, un professeur de révision patient et clair.
Analyse uniquement les photos du cours fournies par l'utilisateur.
Crée une fiche de révision fidèle au cours en français avec : titre, notions importantes, explications simples, définitions, dates/chiffres présents dans les photos et une section "À retenir".
N'invente aucune information absente des photos.`;
  if (action === "quiz") return `Tu es OEA, un professeur qui prépare un contrôle.
Analyse uniquement les photos du cours fournies.
Crée exactement 20 questions à choix multiple en français, avec 4 propositions chacune, une seule correcte et une courte explication.
Couvre les différentes parties du cours et n'invente aucune information.
Réponds UNIQUEMENT en JSON valide selon ce format : {"questions":[{"question":"...","choices":["...","...","...","..."],"answer":0,"explanation":"..."}]}`;
  return `Tu es OEA, un professeur qui crée des flashcards.
Analyse uniquement les photos du cours fournies.
Crée exactement 15 flashcards en français, chacune avec une question courte et une réponse claire.
N'invente aucune information.
Réponds UNIQUEMENT en JSON valide selon ce format : {"cards":[{"question":"...","answer":"..."}]}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Méthode non autorisée." });
  if (!process.env.GEMINI_API_KEY) return json(res, 500, { error: "GEMINI_API_KEY n'est pas configurée sur Vercel." });

  try {
    const { action, images = [], messages = [] } = req.body || {};
    if (!action) return json(res, 400, { error: "Action manquante." });

    if (["course", "quiz", "cards"].includes(action)) {
      if (!Array.isArray(images) || !images.length) return json(res, 400, { error: "Ajoute au moins une photo de cours." });
      const parts = [{ text: buildRevisionPrompt(action) }];
      for (const image of images.slice(0, 8)) parts.push(imagePart(image));
      const text = await callGemini([{ role: "user", parts }], action === "quiz" || action === "cards" ? "application/json" : null);
      return json(res, 200, { text });
    }

    if (action === "chat") {
      const safeMessages = Array.isArray(messages) ? messages.slice(-12) : [];
      const contents = [];

      if (Array.isArray(images) && images.length) {
        const courseParts = [{ text: "Tu es OEA, un assistant de révision en français. Les images suivantes sont les pages du cours de l'utilisateur. Appuie-toi dessus pour répondre. Si l'information n'est pas présente, dis-le clairement et ne l'invente pas." }];
        for (const image of images.slice(0, 8)) courseParts.push(imagePart(image));
        contents.push({ role: "user", parts: courseParts });
      } else {
        contents.push({ role: "user", parts: [{ text: "Tu es OEA, un assistant de révision patient, clair et pédagogique. Réponds en français et explique simplement." }] });
      }

      for (const m of safeMessages) {
        if (!m || !m.text) continue;
        contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.text) }] });
      }

      const text = await callGemini(contents, null, 1800);
      return json(res, 200, { text });
    }

    return json(res, 400, { error: "Action inconnue." });
  } catch (error) {
    console.error("OEA GEMINI ERROR:", error);
    const status = Number.isInteger(error?.status) && error.status >= 400 ? error.status : 500;
    let message = error?.message || "Une erreur est survenue pendant la génération IA.";
    if (status === 429) message = "Gemini a atteint sa limite du moment. Attends un peu puis réessaie.";
    return json(res, status, { error: `Erreur IA : ${message}` });
  }
}
