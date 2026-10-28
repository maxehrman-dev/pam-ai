// CommonJS copy of src/utils/askGuard.js for the API; tests/ask-guard.test.mjs keeps them identical.
// PAM only answers money and life-decision questions, and always as PAM.
// Deterministic so an off-topic or "who made you" question never reaches the
// AI (no cost, no chance of it answering as a generic chatbot).

const IDENTITY_PATTERN = /\b(who|what) (are|r) (you|u)\b|\bwho (made|built|created|trained|owns) (you|u|pam)\b|\bwhat (model|llm|ai) (are|is|r)\b|\bare (you|u) (an? )?(ai|bot|robot|human|real|person|chatgpt|gpt|claude|gemini|llama)\b|\b(chatgpt|openai|anthropic|claude|gemini|llm|language model)\b|\byour (system )?prompt\b|\bignore (all |your |previous |the )*(instructions|rules)\b/i;

const GREETING_PATTERN = /^(hi|hey|hello|yo|sup|hiya|howdy|good (morning|afternoon|evening)|thanks|thank you|ty|ok|okay|cool)\b[\s!.?]*(pam)?[\s!.?]*$/i;

const MONEY_PATTERN = /\$|€|£|\d+\s?k\b|\b\d{2,}\b|\b50\/50\b|\b\d[\d,.]*\s?(dollars|bucks|grand|percent|%)|\b(money|afford|budget|spend|spending|save|saving|savings|invest|investing|investment|stocks?|etf|index fund|crypto|bitcoin|401k|401\(k\)|ira|roth|hsa|retire|retirement|pension|debt|loan|loans|mortgage|credit|card|apr|interest|rent|lease|buy|buying|purchase|sell|car|house|home|condo|apartment|move|moving|relocate|salary|income|paycheck|raise|bonus|job|offer|quit|career|fired|laid off|layoff|side hustle|freelance|business|startup|tax|taxes|irs|refund|insurance|emergency|fund|net worth|wealth|bills?|expenses?|cost|costs|price|pay|paying|payoff|owe|borrow|tuition|college|school|degree|grad|mba|student|wedding|baby|kids?|child|vacation|trip|travel|subscription|cash|bank|checking|account|goal|goals|financial|finance|finances|plan|cheaper|expensive|worth it)\b/i;

function classifyAsk(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return "empty";
  if (IDENTITY_PATTERN.test(text)) return "identity";
  if (GREETING_PATTERN.test(text)) return "greeting";
  if (MONEY_PATTERN.test(text)) return "money";
  return "offtopic";
}

const PAM_IDENTITY_REPLY = {
  identity: {
    headline: "I'm PAM, your personal asset manager.",
    body: "I run money decisions against your real numbers before you make them: what it does to your monthly buffer, your savings, your goals, and the safer way to get there. I don't move money, and I stick to your finances."
  },
  greeting: {
    headline: "Hi, I'm PAM.",
    body: "Ask me about a money decision you're weighing, and I'll run it against your numbers before you make it."
  },
  offtopic: {
    headline: "That one's outside what I do.",
    body: "I'm PAM. I only work on money decisions, run against your numbers: rent, a car, a job offer, debt, investing, a big purchase. Try one of these."
  }
};

// Any output that talks about the model underneath instead of being PAM.
const OFF_PERSONA_PATTERN = /\b(claude|anthropic|chatgpt|openai|gpt-?\d|large language model|language model|as an ai\b|i'?m an ai\b|i am an ai\b)/i;

function breaksPersona(text) {
  return OFF_PERSONA_PATTERN.test(String(text || ""));
}

module.exports = { classifyAsk, PAM_IDENTITY_REPLY, breaksPersona };
