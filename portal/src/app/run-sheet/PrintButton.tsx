"use client";

export function PrintButton() {
  return (
    <button className="button" type="button" onClick={() => window.print()}>
      Print
    </button>
  );
}
