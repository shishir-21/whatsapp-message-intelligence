import type { AIAnalysis, CategoryCode, CorrectionPayload, PriorityCode } from "./reviewTypes";

export const CATEGORIES = [
  "Routine Update",
  "Incident",
  "Change Request",
  "Resource Update",
  "Question",
  "Irrelevant",
] as const;

export const PRIORITIES = ["low", "medium", "high"] as const;

const CATEGORY_LABELS: Record<CategoryCode, (typeof CATEGORIES)[number]> = {
  ROUTINE_UPDATE: "Routine Update",
  INCIDENT: "Incident",
  CHANGE_REQUEST: "Change Request",
  RESOURCE_UPDATE: "Resource Update",
  QUESTION: "Question",
  IRRELEVANT: "Irrelevant",
};

export function categoryLabel(code: CategoryCode): string {
  return CATEGORY_LABELS[code] ?? code;
}

export function priorityLabel(code: PriorityCode | null): string {
  return code ? code.toLowerCase() : "—";
}

// The API stores entities as JSON; be defensive about its shape.
export function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item != null).map((item) => String(item));
}

export interface CorrectionFormValues {
  category: string;
  summary: string;
  priority: string;
  actionRequired: boolean;
  requestedAction: string;
  people: string; // comma separated
  deadline: string; // datetime-local value or ""
  entities: string; // comma separated
  reviewerName: string;
  notes: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ISO string -> value for <input type="datetime-local"> (local time).
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Pre-fills the correction form from the AI analysis.
export function initialFormValues(ai: AIAnalysis): CorrectionFormValues {
  return {
    category: categoryLabel(ai.category),
    summary: ai.summary ?? "",
    priority: ai.priority ? ai.priority.toLowerCase() : "",
    actionRequired: ai.actionRequired,
    requestedAction: ai.requestedAction ?? "",
    people: ai.people.join(", "),
    deadline: toDateTimeLocal(ai.deadline),
    entities: toStringList(ai.entities).join(", "),
    reviewerName: "",
    notes: "",
  };
}

export function splitList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export type FormErrors = Partial<Record<keyof CorrectionFormValues, string>>;

export function validateForm(values: CorrectionFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!(CATEGORIES as readonly string[]).includes(values.category)) {
    errors.category = "Category is required.";
  }
  if (!values.summary.trim()) errors.summary = "Summary is required.";
  if (!(PRIORITIES as readonly string[]).includes(values.priority)) {
    errors.priority = "Priority is required.";
  }
  if (values.deadline && Number.isNaN(new Date(values.deadline).getTime())) {
    errors.deadline = "Deadline is not a valid date.";
  }
  return errors;
}

// Builds the exact payload the backend accepts. Never includes confidence.
// Call only after validateForm returns no errors.
export function buildCorrectionPayload(values: CorrectionFormValues): CorrectionPayload {
  const payload: CorrectionPayload = {
    category: values.category,
    summary: values.summary.trim(),
    priority: values.priority as CorrectionPayload["priority"],
    actionRequired: values.actionRequired,
    requestedAction: values.requestedAction.trim() || null,
    people: splitList(values.people),
    deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
    entities: splitList(values.entities),
  };
  const reviewerName = values.reviewerName.trim();
  const notes = values.notes.trim();
  if (reviewerName) payload.reviewerName = reviewerName;
  if (notes) payload.notes = notes;
  return payload;
}
