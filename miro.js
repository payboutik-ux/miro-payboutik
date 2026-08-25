import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { CONNAISSANCES } from './connaissances.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(process.cwd()));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `
Tu es Miro, l'assistant intelligent de l'application Pay Boutik, une plateforme e-commerce.
`;

const INSTRUCTIONS_COMPLETES = SYSTEM_PROMPT + CONNAISSANCES;

const sessions = {};
const DUREE_SESSION_MS = 24 * 60 * 60 * 1000;

function nettoyerSessionsExpirees() {
  const maintenant = Date.now();
  for (const id in sessions) {
    if (maintenant - sessions[id].createdAt > DUREE_SESSION_MS) {
      delete sessions[id];
    }
  }
}
setInterval(nettoyerSessionsExpirees, 60 * 60 * 1000);

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.post('/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message manquant" });
    }

    const sessionId = userId || 'default';
    const maintenant = Date.now();

    if (!sessions[sessionId] || (maintenant - sessions[sessionId].createdAt > DUREE_SESSION_MS)) {
      sessions[sessionId] = {
        history: [],
        createdAt: maintenant
      };
    }

    const session = sessions[sessionId];

    const contents = [
      ...session.history,
      { role: 'user', parts: [{ text: message }] }
    ];

    const stream = await ai.models.generateContentStream({
      model: "gemini-3.6-flash",
      contents: contents,
      config: {
        systemInstruction: INSTRUCTIONS_COMPLETES,
        thinkingConfig: {
          thinkingLevel: "low"
        }
      }
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    let texteComplet = '';

    for await (const chunk of stream) {
      const morceau = chunk.text;
      if (morceau) {
        texteComplet += morceau;
        res.write(morceau);
      }
    }

    res.end();

    session.history.push({ role: 'user', parts: [{ text: message }] });
    session.history.push({ role: 'model', parts: [{ text: texteComplet }] });

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erreur de génération" });
    } else {
      res.end();
    }
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur démarré sur le port " + PORT);
});
