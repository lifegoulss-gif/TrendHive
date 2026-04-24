import Link from "next/link";

export default function LandingPage() {
	return (
		<div
			className="min-h-screen bg-white flex flex-col"
			style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
		>
			{/* Nav */}
			<nav className="px-8 py-5 flex items-center justify-between border-b border-zinc-100">
				<div className="flex items-center gap-2.5">
					<div className="w-7 h-7 bg-zinc-950 rounded-lg flex items-center justify-center">
						<svg
							className="w-3.5 h-3.5 text-white"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2.5}
								d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
							/>
						</svg>
					</div>
					<span className="text-sm font-semibold text-zinc-950 tracking-tight">
						UniboxAI
					</span>
				</div>
				<Link
					href="/dashboard"
					className="text-sm text-zinc-500 hover:text-zinc-900 font-medium transition-colors flex items-center gap-1.5"
				>
					Open dashboard
					<svg
						className="w-3.5 h-3.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</Link>
			</nav>

			{/* Hero */}
			<main className="flex-1">
				<section className="max-w-3xl mx-auto px-8 pt-28 pb-24 text-center">
					<div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-full text-xs font-medium text-zinc-500 mb-10 tracking-wide">
						<span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
						Powered by Claude AI
					</div>
					<h1 className="text-[3.25rem] font-bold text-zinc-950 leading-[1.1] tracking-tight mb-6">
						One inbox for every
						<br />
						employee WhatsApp
					</h1>
					<p className="text-lg text-zinc-500 max-w-xl mx-auto mb-12 leading-relaxed font-normal">
						Unify your team&apos;s WhatsApp conversations, automatically extract
						to-dos with AI, and never miss a customer commitment again.
					</p>
					<Link
						href="/dashboard"
						className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-950 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800 transition-colors"
					>
						Get started
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M17 8l4 4m0 0l-4 4m4-4H3"
							/>
						</svg>
					</Link>
					<p className="text-xs text-zinc-400 mt-5">
						No credit card required · 14-day free trial
					</p>
				</section>

				{/* Features */}
				<section className="max-w-5xl mx-auto px-8 pb-28">
					<div className="grid grid-cols-3 gap-5">
						{[
							{
								icon: (
									<svg
										className="w-4 h-4 text-zinc-950"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.75}
											d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
										/>
									</svg>
								),
								title: "Unified Inbox",
								description:
									"See every employee's WhatsApp conversations in one place. No more chasing updates across phones.",
							},
							{
								icon: (
									<svg
										className="w-4 h-4 text-zinc-950"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.75}
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
								),
								title: "AI To-Do Detection",
								description:
									"Claude automatically spots commitments in chats — deliveries, callbacks, follow-ups — and turns them into tracked to-dos.",
							},
							{
								icon: (
									<svg
										className="w-4 h-4 text-zinc-950"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.75}
											d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
										/>
									</svg>
								),
								title: "Role-Based Access",
								description:
									"Owners, managers, and employees each see what they need. Full audit trail, complete data isolation per tenant.",
							},
						].map((feat) => (
							<div
								key={feat.title}
								className="border border-zinc-200 rounded-2xl p-6 hover:border-zinc-300 transition-colors"
							>
								<div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center mb-4">
									{feat.icon}
								</div>
								<h3 className="text-sm font-semibold text-zinc-900 mb-2">
									{feat.title}
								</h3>
								<p className="text-sm text-zinc-500 leading-relaxed">
									{feat.description}
								</p>
							</div>
						))}
					</div>
				</section>
			</main>

			{/* Footer */}
			<footer className="px-8 py-6 border-t border-zinc-100">
				<div className="max-w-5xl mx-auto flex items-center justify-between">
					<span className="text-xs text-zinc-400">
						© {new Date().getFullYear()} UniboxAI
					</span>
					<span className="text-xs text-zinc-400">Built with Claude AI</span>
				</div>
			</footer>
		</div>
	);
}
