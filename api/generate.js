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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY n'est pas configurée sur Vercel."
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

"answer" doit être l'index de la bonne réponse : 0, 1, 2 ou 3.`,

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

    const parts = [
      {
        text: prompt
      }
    ];

    // Maximum 8 images
    for (const image of images.slice(0, 8)) {
      if (typeof image !== "string") continue;

      const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);

      if (!match) {
        return res.status(400).json({
          error: "Format d'image non reconnu."
        });
      }

      parts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2]
        }
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: parts
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("GEMINI API ERROR:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Erreur lors de l'appel à Gemini."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.filter((part) => typeof part.text === "string")
        ?.map((part) => part.text)
        ?.join("\n") || "";

    if (!text) {
      return res.status(500).json({
        error: "Gemini n'a renvoyé aucun texte."
      });
    }

    return res.status(200).json({
      text: text
    });

  } catch (error) {
    console.error("OEA GEMINI ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Une erreur est survenue pendant la génération IA."
    });
  }
}
