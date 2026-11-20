"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card border-red-200 bg-red-50">
      <p className="font-medium text-red-800">Something went wrong</p>
      <p className="mt-1 text-sm text-red-700">{error.message}</p>
      <button className="btn-ghost mt-3" onClick={() => reset()}>Try again</button>
    </div>
  );
}
