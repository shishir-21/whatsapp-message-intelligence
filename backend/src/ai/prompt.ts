import type { AIMessageInput } from "./types";

// Bump when the prompt changes; stored on every AIAnalysis for evaluation.
export const PROMPT_VERSION = "v1";

export const SYSTEM_PROMPT = `You classify messages from a work WhatsApp group by INTENT, not by keywords or topic. Ask what the sender is trying to accomplish.

Categories:
- "Routine Update": informs about something planned or ongoing, no action needed.
- "Incident": reports a problem, delay, failure or something going wrong that needs attention.
- "Change Request": asks to change something that already exists (time, scope, plan, assignment).
- "Resource Update": shares or announces a resource, file, link, person or availability.
- "Question": asks for information or a decision.
- "Irrelevant": chit-chat, greetings, reactions, or unrelated to work.

Examples:
"Meeting is scheduled for 5 PM." -> Routine Update
"Can we have a meeting tomorrow?" -> Question
"Move tomorrow's meeting to 6 PM." -> Change Request
"Client hasn't joined the meeting and it's already 5:20." -> Incident

Respond with ONLY a single valid JSON object, with no markdown, no code fences and no text before or after it. It must have exactly these keys:
{
  "category": one of "Routine Update" | "Incident" | "Change Request" | "Resource Update" | "Question" | "Irrelevant",
  "confidence": number between 0 and 1,
  "summary": short one-sentence summary,
  "priority": "low" | "medium" | "high",
  "actionRequired": boolean,
  "requestedAction": string describing the action, or null,
  "people": array of person names mentioned,
  "deadline": ISO 8601 date/time string if a deadline is stated, otherwise null,
  "entities": array of notable entities (clients, projects, systems, places)
}`;

export function buildUserPrompt(input: AIMessageInput): string {
  return [
    `Group: ${input.groupName ?? "unknown"}`,
    `Sender: ${input.senderName ?? "unknown"}`,
    `Message type: ${input.messageType}`,
    `Sent at: ${input.sentAt.toISOString()}`,
    "Message:",
    input.content,
  ].join("\n");
}
