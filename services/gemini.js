import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getFinancialSummary(transactions) {
  const plainTextSummary = transactions.map(tx => {
    return `${tx.transaction_type.toUpperCase()} of ₹${tx.amount} for ${tx.description} in category ${tx.category_name || 'N/A'} on ${new Date(tx.transaction_time).toLocaleDateString()}`;
  }).join('\n');

  const prompt = `
    Analyze the following transactions and provide a brief financial summary, spending habits, and smart money tips:\n\n${plainTextSummary}
  `;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return result.text;
}
