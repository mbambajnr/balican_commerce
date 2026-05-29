"use client";

const defaultMap: Record<string, string> = {
  active: "badge-green",
  inactive: "badge-gray",
  draft: "badge-gray",
  pending: "badge-yellow",
  pending_payment: "badge-yellow",
  under_review: "badge-yellow",
  requested: "badge-yellow",
  confirmed: "badge-blue",
  rescheduled: "badge-purple",
  in_progress: "badge-blue",
  completed: "badge-green",
  cancelled: "badge-red",
  sent: "badge-blue",
  accepted: "badge-green",
  rejected: "badge-red",
  expired: "badge-gray",
  paid: "badge-green",
  unpaid: "badge-yellow",
  partially_paid: "badge-yellow",
  overdue: "badge-red",
  approved: "badge-green",
  verified: "badge-green",
  successful: "badge-green",
  pending_verification: "badge-yellow",
  issued: "badge-blue",
  submitted: "badge-yellow",
  ordered: "badge-blue",
  processing: "badge-blue",
  shipped: "badge-purple",
  delivered: "badge-green",
  returned: "badge-red",
  ready_for_service: "badge-green",
  quote_sent: "badge-blue",
};

export function statusBadgeClass(status: string): string {
  return defaultMap[status] || "badge-gray";
}

export function formatStatus(status: string): string {
  if (!status) return "N/A";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${statusBadgeClass(status)}`}>
      {formatStatus(status)}
    </span>
  );
}
