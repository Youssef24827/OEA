# OEA — assistant de révision avec IA

OEA est une application web qui analyse les photos d’un cours et peut générer :
- une fiche de cours ;
- exactement 20 questions ;
- 15 flashcards.

## Déploiement

Cette version nécessite un hébergement qui exécute `api/generate.js` (par exemple Vercel) et une variable secrète `OPENAI_API_KEY`. Ne mets jamais la clé API dans `index.html`.

Le serveur utilise le SDK officiel OpenAI et le modèle `gpt-6-astra`.

## Google

Une fois OEA publié sur une URL publique, le site peut être proposé à l’indexation via Google Search Console. L’apparition dans Google n’est pas instantanée et n’est pas garantie.
