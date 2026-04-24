import { prisma } from "@repo/database";
import Link from "next/link";

interface Props {
	params: Promise<{ token: string }>;
}

async function getInvite(token: string) {
	const invite = await prisma.invite.findUnique({
		where: { token },
		include: {
			org: { select: { name: true, displayName: true, avatar: true } },
		},
	});
	return invite;
}

export default async function JoinPage({ params }: Props) {
	const { token } = await params;
	const invite = await getInvite(token);

	const isExpired = !invite || invite.expiresAt < new Date();
	const isUsed = invite?.acceptedAt != null;

	const orgName = invite?.org.displayName ?? invite?.org.name ?? "this workspace";
	const roleLabel =
		invite?.role === "MANAGER" ? "Manager" : "Employee";

	const signUpUrl = `/auth/sign-up?invite=${token}&redirect_url=/join/${token}/accept`;
	const signInUrl = `/auth/sign-in?redirect_url=/join/${token}/accept`;

	return (
		<div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
			<div className="w-full max-w-sm">
				{/* Logo */}
				<div className="flex justify-center mb-8">
					<div className="w-10 h-10 bg-zinc-950 rounded-xl flex items-center justify-center">
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
				</div>

				<div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
					{isUsed || isExpired ? (
						/* ── Error state ── */
						<div className="px-8 py-10 text-center">
							<div className="w-12 h-12 bg-red-50 border border-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
								<svg
									className="w-6 h-6 text-red-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</div>
							<h1 className="text-[15px] font-semibold text-zinc-900 mb-1">
								{isUsed ? "Invite already used" : "Invite expired"}
							</h1>
							<p className="text-[13px] text-zinc-500 leading-relaxed">
								{isUsed
									? "This invite link has already been accepted."
									: "This invite link has expired. Ask your manager to send a new one."}
							</p>
						</div>
					) : (
						/* ── Valid invite ── */
						<>
							{/* Header */}
							<div className="px-8 pt-8 pb-6 text-center border-b border-zinc-100">
								{/* Org avatar */}
								<div className="w-14 h-14 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-xl font-bold">
									{orgName.charAt(0).toUpperCase()}
								</div>
								<p className="text-[12px] font-medium text-zinc-400 uppercase tracking-widest mb-1">
									You've been invited
								</p>
								<h1 className="text-lg font-semibold text-zinc-950 leading-snug">
									Join{" "}
									<span className="text-indigo-600">{orgName}</span>
								</h1>
								<p className="text-[13px] text-zinc-500 mt-1">
									as a{" "}
									<span className="font-medium text-zinc-700">{roleLabel}</span>
								</p>

								{invite.email && (
									<div className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5">
										<svg
											className="w-3.5 h-3.5 text-zinc-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
											/>
										</svg>
										Invited as {invite.email}
									</div>
								)}
							</div>

							{/* Actions */}
							<div className="px-8 py-6 space-y-3">
								<Link
									href={signUpUrl}
									className="flex items-center justify-center w-full py-3 bg-zinc-950 text-white text-[14px] font-semibold rounded-xl hover:bg-zinc-800 transition-colors"
								>
									Create account & join
								</Link>
								<Link
									href={signInUrl}
									className="flex items-center justify-center w-full py-3 bg-white border border-zinc-200 text-zinc-700 text-[14px] font-medium rounded-xl hover:bg-zinc-50 transition-colors"
								>
									I already have an account
								</Link>
							</div>

							{/* What you'll get */}
							<div className="px-8 pb-7">
								<p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
									What you'll have access to
								</p>
								<ul className="space-y-2">
									{[
										"Your AI-extracted customer to-dos",
										"Messages from your WhatsApp session",
										"Real-time task notifications",
									].map((item) => (
										<li key={item} className="flex items-start gap-2.5">
											<svg
												className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												aria-hidden="true"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2.5}
													d="M5 13l4 4L19 7"
												/>
											</svg>
											<span className="text-[12px] text-zinc-500">{item}</span>
										</li>
									))}
								</ul>
							</div>
						</>
					)}
				</div>

				<p className="text-center text-[12px] text-zinc-400 mt-5">
					UniboxAI · WhatsApp team inbox
				</p>
			</div>
		</div>
	);
}
