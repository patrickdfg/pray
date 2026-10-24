export function flagSharedError(error: unknown) {
  const code = String((error as any)?.code || "");
  if (code.includes("resource-exhausted") || code.includes("unavailable")) {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("pray:sharing-unavailable"));
  }
}
