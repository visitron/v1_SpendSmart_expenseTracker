
// services/gemini.js
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Summarize a user's transactions using Gemini.
 * @param {Array} transactions - list of objects like:
 *   { transaction_type, amount, transaction_time, description, category }
 * @returns {Object} parsed JSON summary OR raw text if parsing fails
 */
export async function getFinancialSummary(transactions = []) {
  // Convert transactions into readable lines
  const rowsText = transactions
    .map((tx) => {
      const date = tx.transaction_time
        ? new Date(tx.transaction_time).toLocaleDateString("en-IN")
        : "unknown date";
      const desc = tx.description ? ` — ${tx.description}` : "";
      const cat = tx.category ? ` (${tx.category})` : "";
      return `${tx.transaction_type.toUpperCase()} of ₹${tx.amount} on ${date}${cat}${desc}`;
    })
    .join("\n");

  const prompt = `
You are SpendSmart — a concise, privacy-conscious personal finance assistant for Indian users.

Given the user's transaction list below, produce a JSON object with:
- "short_summary": 1-2 sentence summary of balance/trend,
- "top_categories": array of { "category": string, "total_amount": number },
- "actionable_tips": array of 2-4 short strings,
- "flagged_items": any unusual/large transactions (amount > 5000) as array of strings.

Transactions:
${rowsText}

Return only valid JSON (no markdown, no explanation, no code fences).
  `.trim();

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  let output = result.text.trim();

  // 🩹 Fix: strip Markdown fences if Gemini wraps JSON in ```json ... ```
  if (output.startsWith("```")) {
    output = output.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  }

  try {
    return JSON.parse(output);
  } catch (e) {
    return { raw: result.text, error: "Could not parse JSON" };
  }
}
