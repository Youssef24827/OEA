import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { action, images } = req.body || {};
    if (!action || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "Il faut envoyer une action et au moins une image." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY n'est pas configurée sur le serveur." });
    }

    const prompts = {
      course: `Tu es un professeur patient et clair. Analyse uniquement le contenu des photos du cours. Crée une fiche de révision en français, fidèle aux documents, avec : un titre, les notions importantes, des explications simples, les définitions, les dates/chiffres utiles et une partie "À retenir". N'invente aucune information absente des photos. Utilise du Markdown.`,
      quiz: `Tu es un professeur qui prépare un contrôle. Analyse uniquement le contenu des photos du cours. Crée exactement 20 questions à choix multiple en français. Chaque question doit avoir 4 réponses, une seule correcte, et une explication courte. Les questions doivent couvrir les différentes parties du cours. N'invente aucune information absente des photos. Retourne uniquement un JSON valide sous la forme {"questions":[{"question":"...","choices":["...","...","...","..."],"answer":0,"explanation":"..."}]} où answer est l'index 0 à 3 de la bonne réponse.`,
      cards: `Tu es un professeur qui crée des flashcards. Analyse uniquement le contenu des photos du cours. Crée 15 flashcards en français, utiles pour mémoriser les notions essentielles. Chaque carte doit avoir une question courte et une réponse claire. N'invente aucune information absente des photos. Retourne uniquement un JSON valide sous la forme {"cards":[{"question":"...","answer":"..."}]}.`
    };

    const prompt = prompts[action];
    if (!prompt) return res.status(400).json({ error: "Action inconnue." });

    const content = [{ type: "input_text", text: prompt }];
    for (const image of images.slice(0, 8)) {
      content.push({ type: "input_image", image_url: image, detail: "high" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-6-astra",
      input: [{ role: "user", content }],
      max_output_tokens: action === "course" ? 5000 : 7000
    });

    const text = response.output_text || "";
    return res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Une erreur est survenue pendant la génération IA." });
  }
}
