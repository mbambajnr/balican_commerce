"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CreditCard, X } from "@phosphor-icons/react";
import toast from "react-hot-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (limit: number, terms: string) => Promise<void>;
}

export default function CreditApplicationModal({ open, onClose, onSubmit }: Props) {
  const [limit, setLimit] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const cancelRef = useRef<HTMLButtonElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setLimit("");
      setTerms("");
      setError("");
      setSubmitting(false);
      prevFocusRef.current = document.activeElement as HTMLElement;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    return () => {
      prevFocusRef.current?.focus();
    };
  }, [open]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const first = cancelRef.current;
    const last = submitRef.current;
    if (!first || !last) return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  const validate = (val: string): string => {
    if (!val.trim()) return "Credit limit is required";
    const num = Number(val.replace(/,/g, ""));
    if (isNaN(num)) return "Must be a number";
    if (num <= 0) return "Must be greater than zero";
    return "";
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/[^0-9]/g, "");
    setLimit(Number(digits).toLocaleString());
    setError(validate(digits));
  };

  const handleSubmit = async () => {
    const raw = limit.replace(/,/g, "");
    const err = validate(raw);
    if (err) { setError(err); return; }
    const num = Number(raw);
    setSubmitting(true);
    try {
      await onSubmit(num, terms.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-slide-up sm:animate-fade-scale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-modal-title"
      >
        {/* Header */}
        <div className="relative px-6 pt-8 pb-2 text-center sm:text-left">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-lg text-muted hover:text-ink hover:bg-zinc-100 transition-colors"
            aria-label="Close"
          >
            <X size={18} weight="bold" />
          </button>

          <div className="mx-auto sm:mx-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
            <CreditCard size={28} className="text-accent-bold" weight="duotone" />
          </div>

          <h2 id="credit-modal-title" className="mt-4 font-display text-xl font-semibold text-ink">Apply for Credit Sales</h2>
          <p className="mt-1.5 text-sm text-muted leading-relaxed">
            Request a credit limit for your company account. Your application will be reviewed by the Bali-Can sales team.
          </p>
        </div>

        {/* Form */}
        <div className="px-6 pt-4 pb-6 space-y-5">
          {/* Limit input */}
          <div>
            <label className="input-label block mb-1.5 text-sm font-medium text-ink">
              Requested Credit Limit <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink pointer-events-none">
                GHC
              </span>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={limit}
                onChange={handleLimitChange}
                placeholder="0"
                className={`input pl-12 pr-4 h-12 text-lg font-semibold ${error ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                aria-invalid={!!error}
                aria-describedby={error ? "credit-error" : undefined}
              />
            </div>
            {error && (
              <p id="credit-error" className="mt-1.5 text-xs text-red-500 font-medium">{error}</p>
            )}
          </div>

          {/* Terms input */}
          <div>
            <label className="input-label block mb-1.5 text-sm font-medium text-ink">
              Preferred Payment Terms
            </label>
            <select
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="input h-12"
            >
              <option value="">Select terms...</option>
              <option value="7">7 days</option>
              <option value="15">15 days</option>
              <option value="30">30 days</option>
              <option value="45">45 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              ref={cancelRef}
              onClick={onClose}
              disabled={submitting}
              className="btn btn-ghost flex-1 h-12 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              ref={submitRef}
              onClick={handleSubmit}
              disabled={submitting || !limit.trim()}
              className="btn btn-primary flex-1 h-12 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
