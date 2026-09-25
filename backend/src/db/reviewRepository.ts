import type { MessageCategory, Prisma, Priority, ReviewStatus } from "@prisma/client";
import { prisma } from "./prisma";

const withContext = {
  aiAnalysis: { include: { message: true } },
  finalResult: true,
} satisfies Prisma.ReviewInclude;

export type ReviewWithContext = Prisma.ReviewGetPayload<{ include: typeof withContext }>;

// The human-facing result written to FinalResult.
export interface FinalResultValues {
  category: MessageCategory;
  summary: string | null;
  priority: Priority | null;
  actionRequired: boolean;
  requestedAction: string | null;
  people: string[];
  deadline: Date | null;
  entities: string[];
}

export interface ReviewResolution {
  status: Exclude<ReviewStatus, "PENDING">;
  reviewerName?: string;
  notes?: string;
  final: FinalResultValues;
}

export function findPending(): Promise<ReviewWithContext[]> {
  return prisma.review.findMany({
    where: { status: "PENDING" },
    include: withContext,
    orderBy: { createdAt: "asc" },
  });
}

export function findById(id: string): Promise<ReviewWithContext | null> {
  return prisma.review.findUnique({ where: { id }, include: withContext });
}

// Moves a PENDING review to its decided status and writes the FinalResult in
// one transaction. The status guard makes it a compare-and-set: returns false
// (and writes nothing) if the review was no longer PENDING, so concurrent or
// repeated requests can never produce a second FinalResult.
export function resolveReview(id: string, resolution: ReviewResolution): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.review.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: resolution.status,
        reviewerName: resolution.reviewerName,
        notes: resolution.notes,
        reviewedAt: new Date(),
      },
    });
    if (count === 0) return false;

    const review = await tx.review.findUniqueOrThrow({
      where: { id },
      select: { aiAnalysis: { select: { id: true, messageId: true } } },
    });
    await tx.finalResult.create({
      data: {
        messageId: review.aiAnalysis.messageId,
        aiAnalysisId: review.aiAnalysis.id,
        reviewId: id,
        ...resolution.final,
      },
    });
    return true;
  });
}
