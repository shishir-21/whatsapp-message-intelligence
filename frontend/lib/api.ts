import type { SelectedGroup, WhatsAppGroup, WhatsAppStatusResponse } from "./whatsappTypes";
import type { CategoryFilter, HistoryMessage, MessagesResponse, ProcessingStatus } from "./messageTypes";
import type {
  CorrectionPayload,
  Review,
  ReviewResponse,
  ReviewsResponse,
} from "./reviewTypes";

// Single place that knows the backend URL.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: string;
  issues?: { path: string; message: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new ApiError("NEXT_PUBLIC_API_URL is not set. Add it to frontend/.env.local.");
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError("Could not reach the server.");
  }

  if (!res.ok) {
    let body: ErrorBody = {};
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // non-JSON error body; fall through to the generic message
    }
    const issues = body.issues?.map((i) => `${i.path}: ${i.message}`).join("; ");
    const message =
      [body.error, issues].filter(Boolean).join(" - ") || `Request failed (${res.status}).`;
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}

export async function getReviews(groupId?: string): Promise<Review[]> {
  const data = await request<ReviewsResponse>(groupId ? `/api/reviews?${new URLSearchParams({ groupId })}` : "/api/reviews");
  return data.reviews;
}

export async function getMessages(
  status: ProcessingStatus,
  category: CategoryFilter = "ALL",
  groupId?: string,
): Promise<HistoryMessage[]> {
  const params = new URLSearchParams({ status });
  if (category !== "ALL") params.set("category", category);
  if (groupId) params.set("groupId", groupId);
  const data = await request<MessagesResponse>(`/api/messages?${params}`);
  return data.messages;
}

export async function approveReview(id: string): Promise<Review> {
  const data = await request<ReviewResponse>(`/api/reviews/${encodeURIComponent(id)}/approve`, {
    method: "POST",
  });
  return data.review;
}

export async function correctReview(id: string, payload: CorrectionPayload): Promise<Review> {
  const data = await request<ReviewResponse>(`/api/reviews/${encodeURIComponent(id)}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.review;
}

export function getWhatsAppStatus(): Promise<WhatsAppStatusResponse> {
  return request<WhatsAppStatusResponse>("/api/whatsapp/status");
}

export async function getWhatsAppQr(): Promise<string | null> {
  const data = await request<{ qr: string | null }>("/api/whatsapp/qr");
  return data.qr;
}

export function connectWhatsApp(): Promise<WhatsAppStatusResponse> {
  return request<WhatsAppStatusResponse>("/api/whatsapp/connect", { method: "POST" });
}

export async function getWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  const data = await request<{ groups: WhatsAppGroup[] }>("/api/whatsapp/groups");
  return data.groups;
}

// The backend answers 404 when no group has been selected yet.
export async function getSelectedGroup(): Promise<SelectedGroup | null> {
  try {
    const data = await request<{ group: SelectedGroup }>("/api/whatsapp/groups/selected");
    return data.group;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function selectWhatsAppGroup(groupId: string): Promise<SelectedGroup> {
  const data = await request<{ group: SelectedGroup }>("/api/whatsapp/groups/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId }),
  });
  return data.group;
}

export function logoutWhatsApp(): Promise<WhatsAppStatusResponse> {
  return request<WhatsAppStatusResponse>("/api/whatsapp/logout", { method: "POST" });
}
