import { generateJson } from "./gemini";
import { quizPrompt } from "./prompts";
import { QuizSchema, type Fact, type Quiz } from "./schemas";

/** Generate a multiple-choice recall quiz from a song's source facts. */
export async function generateQuiz(facts: Fact[], count = 6): Promise<Quiz> {
  const p = quizPrompt(facts, count);
  return generateJson({
    model: "flash-lite",
    system: p.system,
    prompt: p.prompt,
    schema: QuizSchema,
    temperature: 0.5,
  });
}
