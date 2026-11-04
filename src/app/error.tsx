"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console or error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-600 mb-4">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h1 className="text-[24px] font-bold text-ink">Something went wrong</h1>
      <p className="mt-2 text-[14px] text-gray-500 max-w-md">
        An unexpected server error occurred while loading this page. Please try refreshing or return to the homepage.
      </p>

      {error.message && process.env.NODE_ENV !== "production" && (
        <pre className="mt-4 max-w-xl overflow-x-auto rounded-lg bg-gray-100 p-3 text-left text-[12px] text-red-800">
          {error.message}
        </pre>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-xs hover:opacity-95 transition-opacity"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-[14px] font-semibold text-ink shadow-xs hover:bg-gray-50 transition-colors"
        >
          <Home className="h-4 w-4" />
          Back to Homepage
        </Link>
      </div>
    </div>
  );
}

