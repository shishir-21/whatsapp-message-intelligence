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

export async function getReviews(): Promise<Review[]> {
  const data = await request<ReviewsResponse>("/api/reviews");
  return data.reviews;
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
