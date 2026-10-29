/** Reject accidentally async callbacks before committing. */
export function requireSynchronous<T>(result: T): T {
  if (
    result !== null &&
    (typeof result === "object" || typeof result === "function") &&
    "then" in result &&
    typeof result.then === "function"
  ) {
    // Observe rejection; transaction guards prevent later storage access.
    void Promise.resolve(result).catch(() => {});

    throw new Error("Storage callbacks must be synchronous");
  }

  return result;
}
