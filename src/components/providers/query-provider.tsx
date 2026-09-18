"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { shouldRetryQuery } from "@/lib/api/retry-policy";

/**
 * Server-state cache for content resources only.
 *
 * It is not an authority on authentication: it holds no backend token, no
 * SafeAdmin and no session lifecycle. SessionHeartbeat and the session route
 * handlers remain the only owners of that.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            gcTime: 10 * 60 * 1000,
            retry: shouldRetryQuery,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
