import { SignUp } from "@clerk/nextjs";

interface Props {
	searchParams: Promise<{ invite?: string; redirect_url?: string }>;
}

export default async function SignUpPage({ searchParams }: Props) {
	const { invite, redirect_url } = await searchParams;

	// Invited users complete the join flow after sign-up
	const afterUrl = redirect_url ?? (invite ? `/join/${invite}/accept` : "/dashboard");

	return (
		<div className="flex items-center justify-center min-h-screen bg-zinc-50">
			<div className="w-full max-w-md">
				<div className="text-center mb-8">
					<div className="w-8 h-8 bg-zinc-950 rounded-lg flex items-center justify-center mx-auto mb-4">
						<svg
							className="w-4 h-4 text-white"
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
					<h1 className="text-xl font-semibold text-zinc-950">
						{invite ? "Create your account" : "Start your workspace"}
					</h1>
					{!invite && (
						<p className="text-[13px] text-zinc-400 mt-1">
							Joining via an invite?{" "}
							<span className="text-zinc-600">Check your email for the invite link.</span>
						</p>
					)}
				</div>
				<SignUp
					forceRedirectUrl={afterUrl}
					appearance={{
						elements: {
							rootBox: "w-full",
							card: "shadow-none border border-zinc-200 rounded-2xl",
						},
					}}
				/>
			</div>
		</div>
	);
}
