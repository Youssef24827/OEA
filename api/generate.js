const MODEL = "gemini-3.5-flash-lite";
const ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function json(res, status, body) {
  return res.status(status).json(body);
}

function imagePart(dataUrl) {
  const match = /^data:(image\/[^;]+);base64,(.+)$/.exec(dataUrl || "");

  if (!match) {
    throw new Error("Format d'image non reconnu.");
  }

  return {
    inline_data: {
      mime_type: match[1],
      data: match[2]
    }
  };
}

async function callGemini(contents, options = {}) {
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens || 7000
    }
  };

  if (options.systemInstruction) {
    body.system_instruction = {
      parts: [
        {
          text: options.systemInstruction
        }
      ]
    };
  }

  if (options.responseMimeType) {
    body.generationConfig.responseMimeType = options.responseMimeType;
  }

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
    const message =
      data?.error?.message ||
      `Erreur Gemini (${response.status}).`;

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini n'a renvoyé aucun texte.");
  }

  return text;
}

function buildRevisionPrompt(action) {
  if (action === "course") {
    return `Tu es OEA, un professeur de révision patient et clair.

Analyse uniquement les photos du cours fournies par l'utilisateur.

Crée une fiche de révision fidèle au cours en français avec :
- un titre
- les notions importantes
- des explications simples
- les définitions
- les dates et chiffres présents dans les photos
- une section "À retenir"

N'invente aucune information absente des photos.`;
  }

  if (action === "quiz") {
    return `Tu es OEA, un professeur qui prépare un contrôle.

Analyse uniquement les photos du cours fournies.

Crée exactement 20 questions à choix multiple en français.
Chaque question doit avoir 4 propositions.
Une seule proposition est correcte.
Ajoute une courte explication.

Couvre les différentes parties du cours.
N'invente aucune information.

Réponds UNIQUEMENT avec un JSON valide selon ce format :

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

"answer" doit être 0, 1, 2 ou 3.`;
  }

  return `Tu es OEA, un professeur qui crée des flashcards.

Analyse uniquement les photos du cours fournies.

Crée exactement 15 flashcards en français.
Chaque flashcard doit avoir :
- une question courte
- une réponse claire

N'invente aucune information.

Réponds UNIQUEMENT avec un JSON valide selon ce format :

{
  "cards": [
    {
      "question": "...",
      "answer": "..."
    }
  ]
}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      error: "Méthode non autorisée."
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return json(res, 500, {
      error: "GEMINI_API_KEY n'est pas configurée sur Vercel."
    });
  }

  try {
    const {
      action,
      images = [],
      messages = []
    } = req.body || {};

    if (!action) {
      return json(res, 400, {
        error: "Action manquante."
      });
    }

    // ==========================================
    // IA RÉVISION
    // ==========================================

    if (["course", "quiz", "cards"].includes(action)) {
      if (!Array.isArray(images) || images.length === 0) {
        return json(res, 400, {
          error: "Ajoute au moins une photo de cours."
        });
      }

      const parts = [
        {
          text: buildRevisionPrompt(action)
        }
      ];

      for (const image of images.slice(0, 8)) {
        parts.push(imagePart(image));
      }

      const text = await callGemini(
        [
          {
            role: "user",
            parts
          }
        ],
        {
          responseMimeType:
            action === "quiz" || action === "cards"
              ? "application/json"
              : null,
          maxOutputTokens:
            action === "course" ? 5000 : 7000
        }
      );

      return json(res, 200, {
        text
      });
    }

    // ==========================================
    // IA QUESTIONS / CHAT
    // ==========================================

    if (action === "chat") {
      const allMessages = Array.isArray(messages)
        ? messages.filter(
            message =>
              message &&
              message.text &&
              (message.role === "user" ||
                message.role === "assistant")
          )
        : [];

      if (allMessages.length === 0) {
        return json(res, 400, {
          error: "Écris d'abord une question."
        });
      }

      // Le dernier message envoyé par l'utilisateur
      // devient le nouveau message à traiter.
      const lastUserIndex = allMessages
        .map(message => message.role)
        .lastIndexOf("user");

      if (lastUserIndex === -1) {
        return json(res, 400, {
          error: "Question utilisateur introuvable."
        });
      }

      const currentMessage = allMessages[lastUserIndex];

      // Historique = tout ce qui précède le message actuel.
      const history = allMessages.slice(0, lastUserIndex);

      const contents = [];

      // On garde uniquement l'historique proprement alterné :
      // user -> model -> user -> model...
      for (const message of history) {
        contents.push({
          role: message.role === "assistant"
            ? "model"
            : "user",
          parts: [
            {
              text: String(message.text)
            }
          ]
        });
      }

      // Nouveau message utilisateur.
      const currentParts = [
        {
          text: String(currentMessage.text)
        }
      ];

      // Les photos du cours sont ajoutées au message actuel.
      // Ainsi, on évite un message "user" séparé juste avant.
      if (Array.isArray(images) && images.length > 0) {
        currentParts.unshift({
          text:
            "Voici les pages du cours de l'utilisateur. " +
            "Utilise-les comme contexte pour répondre à sa question. " +
            "Si la réponse n'est pas présente dans le cours, dis-le clairement " +
            "et n'invente pas d'information."
        });

        for (const image of images.slice(0, 8)) {
          currentParts.push(imagePart(image));
        }
      }

      contents.push({
        role: "user",
        parts: currentParts
      });

      const text = await callGemini(contents, {
        systemInstruction:
          `Tu es OEA, un assistant de révision intelligent.

Réponds toujours en français.
Sois patient, clair et pédagogique.
Explique les notions simplement.
Tu peux répondre à des questions générales.

Quand des photos de cours sont fournies, utilise-les en priorité.
N'invente jamais une information présentée comme venant du cours.
Quand une information n'est pas dans le cours, dis-le clairement.`,
        maxOutputTokens: 4000
      });

      return json(res, 200, {
        text
      });
    }

    return json(res, 400, {
      error: "Action inconnue."
    });

  } catch (error) {
    console.error("OEA GEMINI ERROR:", error);

    const status =
      Number.isInteger(error?.status) &&
      error.status >= 400
        ? error.status
        : 500;

    let message =
      error?.message ||
      "Une erreur est survenue pendant la génération IA.";

    if (status === 429) {
      message =
        "Gemini a atteint sa limite du moment. Attends un peu puis réessaie.";
    }

    return json(res, status, {
      error: `Erreur IA : ${message}`
    });
  }
}
