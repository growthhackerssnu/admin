import { createListupApi } from "./client";

// Inject the authenticated session provider at app composition time.
// No token input UI, token persistence, or sample-user fallback.
export function configureListupApi(
  getAccessToken: () => Promise<string | null>,
) {
  return createListupApi({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
    getAccessToken,
  });
}
