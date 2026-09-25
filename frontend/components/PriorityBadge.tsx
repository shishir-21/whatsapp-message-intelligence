import type { PriorityCode } from "@/lib/reviewTypes";

const STYLES: Record<PriorityCode, string> = {
  HIGH: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  LOW: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
};

// Single place that styles a priority: HIGH red, MEDIUM yellow, LOW green.
export default function PriorityBadge({ priority }: { priority: PriorityCode | null }) {
  if (!priority) return <span>—</span>;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STYLES[priority]}`}
    >
      {priority.toLowerCase()}
    </span>
  );
}
