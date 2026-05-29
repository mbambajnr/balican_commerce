"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
        <span className="text-2xl text-red-600 font-bold">!</span>
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-soft max-w-md">{error.message || "An unexpected error occurred."}</p>
      <button className="btn btn-primary mt-2" onClick={reset}>
        Try Again
      </button>
    </div>
  );
}
