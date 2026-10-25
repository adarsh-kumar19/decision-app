// api/decide.js — Zero-dependency Vercel Serverless Function for Desions
export default async function handler(req, res) {
  // 1. Allow only POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { query = '', perspective = 'Balanced & Practical' } = req.body || {};

    if (!query || query.trim().length < 3) {
      return res.status(400).json({ error: 'Please enter a valid decision question.' });
    }

    // 2. LAYER 1 GUARDRAIL: Instant deterministic check for medical, life-safety, or crisis terms
    const safetyRegex = /\b(suicide|suicidal|kill myself|end my life|self[\s-]?harm|overdose|die|death|chest pain|heart attack|stroke|insulin|antibiotics|dosage|prescription|surgery|cancer|tumor|bleeding|unconscious|emergency|doctor|medical|medicine|pill|tablet|symptom|diagnosis)\b/i;

    if (safetyRegex.test(query)) {
      return res.status(200).json({
        blocked: true,
        blockTitle: 'Safety Guardrail Triggered — Medical & Life-Safety Exclusion',
        blockMessage:
          'Desions only evaluates everyday lifestyle, shopping, and practical choices. It is strictly blocked from answering medical, clinical, life-threatening, or self-harm questions.',
        helplines: [
          { name: 'Emergency Services (India)', number: '112' },
          { name: 'Vandrevala Foundation Crisis Helpline', number: '1860-2662-345' },
          { name: 'KIRAN / Tele-MANAS Helpline', number: '14416' }
        ]
      });
    }

    // 3. Check that GEMINI_API_KEY is configured in Vercel Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing GEMINI_API_KEY. Add it in Vercel Project Settings -> Environment Variables.'
      });
    }

    // 4. LAYER 2 & 3: AI Semantic Guardrail + Direct Pros & Cons Generator
    const systemPrompt = `You are Desions, a direct, no-fluff AI decision engine.
Your job is to help users make everyday real-life decisions (shopping, finance, food, career, travel, daily habits) by giving a clear Winner and side-by-side Pros & Cons.

STRICT SAFETY GUARDRAIL:
If the user's question involves medical symptoms, doctor advice, taking/stopping medication, mental health crisis, suicide, death, or life-threatening danger, you MUST immediately return:
{"blocked": true, "blockTitle": "Medical & Life-Safety Guardrail", "blockMessage": "Desions cannot answer medical, health, or life-safety questions. Please consult a qualified doctor or emergency service."}

FOR ALL SAFE EVERYDAY QUESTIONS:
Analyze the user's question and constraints (like budget in INR/Lakhs, time, or priority perspective) and return ONLY valid JSON in this exact format:
{
  "blocked": false,
  "winner": "A" or "B",
  "verdictHeadline": "Direct 1-line decision (e.g., Buy the iPhone 18 and save ₹20,000)",
  "verdictSummary": "2 concise sentences explaining why this option wins given their exact budget or constraints.",
  "optionA": {
    "name": "Name of Option A",
    "subtitle": "Short price or effort tag (e.g., ~₹79,900 • Fits ₹1L Budget)",
    "pros": ["Specific Pro 1", "Specific Pro 2", "Specific Pro 3"],
    "cons": ["Specific Con 1", "Specific Con 2"]
  },
  "optionB": {
    "name": "Name of Option B",
    "subtitle": "Short price or effort tag (e.g., ~₹1,44,900 • ₹45k Over Budget)",
    "pros": ["Specific Pro 1", "Specific Pro 2", "Specific Pro 3"],
    "cons": ["Specific Con 1", "Specific Con 2"]
  }
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: `User Question: "${query}"\nSelected Priority Lens: "${perspective}"` }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'AI API request failed.' });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsedResult = JSON.parse(rawText);

    return res.status(200).json(parsedResult);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to evaluate decision. Please try again.',
      details: error.message
    });
  }
}
