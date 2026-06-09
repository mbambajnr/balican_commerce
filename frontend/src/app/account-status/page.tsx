"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";

interface AccountStatus {
  account_status: string;
  role: string;
  company_role: string;
  email: string;
  first_name: string;
  last_name: string;
  company_id: string | null;
  company_name: string | null;
  company_status: string | null;
  verification_status: string | null;
  is_provider: boolean;
  company_type: string | null;
  status_change_reason: string | null;
  status_changed_at: string | null;
  rejection_reason: string | null;
  subscription_status: string | null;
  plan_name: string | null;
  plan_display_name: string | null;
}

const STATUS_CONFIGS: Record<string, {
  title: string;
  description: string;
  color: string;
  icon: string;
  action?: { label: string; href: string };
  details?: string[];
}> = {
  pending: {
    title: "Registration Pending",
    description: "Your company registration is pending approval from our administrative team.",
    color: "amber",
    icon: "⏳",
    details: [
      "You can browse the platform but some features are limited.",
      "You will be notified once your registration is reviewed.",
      "This usually takes 1-2 business days.",
    ],
  },
  rejected: {
    title: "Registration Not Approved",
    description: "Your company registration was not approved.",
    color: "red",
    icon: "❌",
    details: [
      "If you believe this is an error, please contact support.",
      "You may need to register again with correct information.",
    ],
  },
  suspended: {
    title: "Account Suspended",
    description: "Your company account has been temporarily suspended.",
    color: "red",
    icon: "🚫",
    details: [
      "You can log in but cannot perform business actions.",
      "Please contact support for more information.",
      "An administrator can reactivate your account.",
    ],
  },
  payment_suspended: {
    title: "Payment Suspension",
    description: "Your account has a payment suspension. Some features are restricted until resolved.",
    color: "purple",
    icon: "💳",
    details: [
      "Business actions are temporarily blocked.",
      "Please resolve any outstanding payments.",
      "Contact support or your account manager for assistance.",
    ],
  },
  deactivated: {
    title: "Account Deactivated",
    description: "Your company account has been deactivated.",
    color: "gray",
    icon: "🔴",
    details: [
      "You can log in but cannot perform business actions.",
      "Please contact support if you wish to reactivate your account.",
    ],
  },
  verification_required: {
    title: "Verification Required",
    description: "Your provider account needs to be verified before you can trade on the platform.",
    color: "blue",
    icon: "📋",
    action: { label: "Go to Verification", href: "/provider/verification" },
    details: [
      "Upload your business documents to begin verification.",
      "Verification is required for supplier and service provider accounts.",
      "Once verified, you can access all platform features.",
    ],
  },
  documents_submitted: {
    title: "Documents Under Review",
    description: "Your verification documents have been submitted and are awaiting admin review.",
    color: "indigo",
    icon: "📄",
    details: [
      "An administrator is reviewing your submitted documents.",
      "You will be notified once the review is complete.",
      "If changes are needed, you will be asked to re-upload.",
    ],
  },
  under_review: {
    title: "Under Review",
    description: "An administrator is actively reviewing your account and documents.",
    color: "indigo",
    icon: "🔍",
    details: [
      "Your verification is currently being processed.",
      "You will be notified of the outcome.",
    ],
  },
  changes_requested: {
    title: "Changes Requested",
    description: "Some of your verification documents need to be corrected or re-uploaded.",
    color: "amber",
    icon: "📝",
    action: { label: "Review & Re-upload", href: "/provider/verification" },
    details: [
      "Check the feedback on each document for details.",
      "Upload corrected versions of the requested documents.",
      "Re-submit for review once all corrections are made.",
    ],
  },
};

export default function AccountStatusPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/auth/login"); return; }

    api.getAccountStatus()
      .then(setStatus)
      .catch(() => {
        // If API fails, try to at least show logout
        setStatus(null);
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  // If user is fully active, redirect to dashboard
  if (status?.company_status === "active" && status?.account_status === "active") {
    const isProvider = status?.is_provider || ["supplier", "service_provider", "both_supplier_and_service_provider"].includes(status?.company_type || "");
    router.push(isProvider ? "/provider" : "/account");
    return null;
  }

  const isProvider = status?.is_provider || ["supplier", "service_provider", "both_supplier_and_service_provider"].includes(status?.company_type || "");

  // Determine which status config to show
  const companyStatus = status?.company_status || "active";
  const verificationStatus = status?.verification_status || "";
  const accountStatus = status?.account_status || "active";

  let configKey = companyStatus;

  // For providers with active company but pending verification, show verification message
  if (companyStatus === "active" && isProvider) {
    if (["not_started", "required"].includes(verificationStatus)) configKey = "verification_required";
    else if (verificationStatus === "submitted") configKey = "documents_submitted";
    else if (verificationStatus === "under_review") configKey = "under_review";
    else if (verificationStatus === "changes_requested") configKey = "changes_requested";
  }

  const config = STATUS_CONFIGS[configKey] || STATUS_CONFIGS.suspended;

  const colorMap: Record<string, { bg: string; border: string; badge: string }> = {
    amber: { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700" },
    red: { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700" },
    purple: { bg: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-100 text-purple-700" },
    gray: { bg: "bg-gray-50", border: "border-gray-200", badge: "bg-gray-100 text-gray-700" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700" },
    indigo: { bg: "bg-indigo-50", border: "border-indigo-200", badge: "bg-indigo-100 text-indigo-700" },
  };

  const colors = colorMap[config.color] || colorMap.gray;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        <div className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-8 shadow-sm`}>
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">{config.icon}</div>
            <h1 className="text-2xl font-bold text-gray-900">{config.title}</h1>
            <p className="text-gray-600 mt-2">{config.description}</p>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {status?.company_status && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors.badge}`}>
                Company: {status.company_status.replace(/_/g, " ")}
              </span>
            )}
            {isProvider && status?.verification_status && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700`}>
                Verification: {status.verification_status.replace(/_/g, " ")}
              </span>
            )}
            {status?.subscription_status && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700`}>
                Plan: {status.plan_display_name || status.plan_name}
              </span>
            )}
          </div>

          {/* Details */}
          {config.details && config.details.length > 0 && (
            <ul className="space-y-2 text-sm text-gray-600 mb-6">
              {config.details.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Reason */}
          {status?.status_change_reason && (
            <div className="text-sm text-gray-500 mb-4 p-3 bg-white/50 rounded-lg">
              <span className="font-medium">Reason: </span>
              {status.status_change_reason}
            </div>
          )}

          {/* Action button */}
          {config.action && (
            <Link
              href={config.action.href}
              className="block w-full text-center px-4 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-bold transition-colors mb-4"
            >
              {config.action.label}
            </Link>
          )}

          {/* Support CTA for restricted states */}
          {["suspended", "payment_suspended", "deactivated", "rejected"].includes(configKey) && (
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-3">Need help resolving this?</p>
              <a
                href="mailto:support@balican.com"
                className="text-sm text-accent hover:underline"
              >
                Contact Support
              </a>
            </div>
          )}

          {/* Logout */}
          <div className="mt-6 text-center border-t pt-4">
            <button
              onClick={() => { localStorage.removeItem("token"); router.push("/auth/login"); }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
