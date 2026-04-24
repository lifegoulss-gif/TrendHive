"use client";

import { trpc } from "@/trpc/client";
import { use, useEffect } from "react";

interface Props {
	params: Promise<{ token: string }>;
}

export default function AcceptPage({ params }: Props) {
	const { token } = use(params);

	const acceptMutation = trpc.invite.accept.useMutation({
		onSuccess: () => {
			// Hard reload to clear the tRPC cache — user is now in a different org
			window.location.href = "/dashboard/todos";
		},
		onError: (err) => {
			// Already accepted = just go to dashboard
			if (err.data?.code === "CONFLICT") {
				window.location.href = "/dashboard/todos";
			}
		},
	});

	useEffect(() => {
		acceptMutation.mutate({ token });
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token]);

	return (
		<div className="min-h-screen bg-zinc-50 flex items-center justify-center">
			<div className="text-center">
				<div className="w-10 h-10 bg-zinc-950 rounded-xl flex items-center justify-center mx-auto mb-6">
					<svg
						className="w-5 h-5 text-white"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2.5}
							d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
						/>
					</svg>
				</div>

				{acceptMutation.isError &&
				acceptMutation.error?.data?.code !== "CONFLICT" ? (
					<div>
						<p className="text-[15px] font-semibold text-zinc-900 mb-1">
							Could not accept invite
						</p>
						<p className="text-[13px] text-zinc-500 max-w-xs mx-auto">
							{acceptMutation.error.message}
						</p>
					</div>
				) : (
					<div>
						<div className="flex items-center justify-center gap-2 mb-2">
							<svg
								className="w-4 h-4 text-zinc-400 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8v8z"
								/>
							</svg>
							<p className="text-[14px] font-medium text-zinc-600">
								Joining workspace…
							</p>
						</div>
						<p className="text-[12px] text-zinc-400">
							You'll be redirected in a moment
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
