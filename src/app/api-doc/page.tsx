"use client";

export default function ApiDocPage() {
  return (
    <div className="h-full w-full">
      <iframe
        src="/api/v1/reference"
        className="h-full w-full border-0"
        title="API Reference"
      />
    </div>
  );
}
