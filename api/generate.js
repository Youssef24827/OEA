import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  try {
    const { action, images } = req.body || {};

    if (!action || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: "Il faut envoyer une action et au moins une image."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY n'est pas configurée sur Vercel."
      });
    }

    const prompts = {
      course: `Tu es un professeur patient et clair.

Analyse uniquement le contenu des photos du cours.

Crée une fiche de révision en français, fidèle aux documents, avec :
- un titre
- les notions importantes
- des explications simples
- les définitions
- les dates et chiffres utiles s'ils apparaissent
- une partie "À retenir"

N'invente aucune information absente des photos.
Utilise du Markdown.`,

      quiz: `Tu es un professeur qui prépare un contrôle.

Analyse uniquement le contenu des photos du cours.

Crée exactement 20 questions à choix multiple en français.
Chaque question doit avoir 4 réponses.
Une seule réponse doit être correcte.
Ajoute une courte explication pour chaque réponse.

Les questions doivent couvrir les différentes parties du cours.

N'invente aucune information absente des photos.

Retourne uniquement un JSON valide sous cette forme :

{
  "questions": [
    {
      "question": "...",
      "choices": ["...", "...", "...", "..."],
      "answer": 0,
      "explanation": "..."
    }
  ]
}

"answer" doit être l'index de la bonne réponse :
0, 1, 2 ou 3.`,

      cards: `Tu es un professeur qui crée des flashcards.

Analyse uniquement le contenu des photos du cours.

Crée 15 flashcards en français, utiles pour mémoriser les notions essentielles.

Chaque carte doit avoir :
- une question courte
- une réponse claire

N'invente aucune information absente des photos.

Retourne uniquement un JSON valide sous cette forme :

{
  "cards": [
    {
      "question": "...",
      "answer": "..."
    }
  ]
}`
    };

    const prompt = prompts[action];

    if (!prompt) {
      return res.status(400).json({
        error: "Action inconnue."
      });
    }

    const content = [
      {
        type: "input_text",
        text: prompt
      }
    ];

    // Maximum 8 images par demande
    for (const image of images.slice(0, 8)) {
      content.push({
        type: "input_image",
        image_url: image,
        detail: "high"
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      input: [
        {
          role: "user",
          content: content
        }
      ],
      max_output_tokens: action === "course" ? 5000 : 7000
    });

    return res.status(200).json({
      text: response.output_text || ""
    });

  } catch (error) {
    console.error("OEA IA ERROR:", error);

    const message =
      error?.error?.message ||
      error?.message ||
      "Erreur inconnue lors de l'appel à l'IA.";

    const status =
      Number.isInteger(error?.status) && error.status >= 400
        ? error.status
        : 500;

    return res.status(status).json({
      error: `Erreur IA : ${message}`
    });
  }
}
