"use client";

import type { AppRouter } from "@/server/routers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import React from "react";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
	if (typeof window !== "undefined") return "";
	if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
	return "http://localhost:3002";
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = React.useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						// Serve cached data instantly on navigation, revalidate in background
						staleTime: 30_000,
						// Keep data in memory for 5 minutes after component unmounts
						gcTime: 5 * 60_000,
						// Don't hammer the server on tab focus or reconnect
						refetchOnWindowFocus: false,
						refetchOnReconnect: false,
						retry: 1,
					},
				},
			}),
	);

	const [trpcClient] = React.useState(() =>
		trpc.createClient({
			links: [
				httpBatchLink({
					url: `${getBaseUrl()}/api/trpc`,
					transformer: superjson,
				}),
			],
		}),
	);

	return (
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
