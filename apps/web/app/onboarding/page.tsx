"use client";

import { trpc } from "@/trpc/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = "org" | "session" | "done";

export default function OnboardingPage() {
	const router = useRouter();
	const [step, setStep] = useState<Step>("org");
	const [orgName, setOrgName] = useState("");
	const [sessionName, setSessionName] = useState("");

	const updateOrg = trpc.org.update.useMutation({
		onSuccess: () => setStep("session"),
	});
	const createSession = trpc.session.create.useMutation({
		onSuccess: () => setStep("done"),
	});

	const steps: Step[] = ["org", "session", "done"];
	const stepIndex = steps.indexOf(step);

	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
			<div className="w-full max-w-md">
				{/* Progress dots */}
				<div className="flex items-center justify-center gap-2 mb-8">
					{steps.map((s, i) => (
						<div
							key={s}
							className={`h-2 rounded-full transition-all duration-300 ${
								i <= stepIndex ? "bg-blue-600 w-8" : "bg-gray-200 w-2"
							}`}
						/>
					))}
				</div>

				<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
					{step === "org" && (
						<>
							<div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
								<svg
									className="w-6 h-6 text-blue-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
									/>
								</svg>
							</div>
							<h1 className="text-2xl font-bold text-gray-900 mb-2">
								Name your organization
							</h1>
							<p className="text-sm text-gray-500 mb-6">
								This is how your team will identify your workspace.
							</p>
							<input
								type="text"
								value={orgName}
								onChange={(e) => setOrgName(e.target.value)}
								placeholder="e.g. Acme Sales Team"
								className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
								onKeyDown={(e) => {
									if (e.key === "Enter" && orgName.trim())
										updateOrg.mutate({ name: orgName.trim() });
								}}
							/>
							{updateOrg.error && (
								<p className="text-xs text-red-500 mt-2">
									{updateOrg.error.message}
								</p>
							)}
							<button
								onClick={() => updateOrg.mutate({ name: orgName.trim() })}
								disabled={!orgName.trim() || updateOrg.isPending}
								className="mt-4 w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
							>
								{updateOrg.isPending ? "Saving…" : "Continue"}
							</button>
						</>
					)}

					{step === "session" && (
						<>
							<div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mb-6">
								<svg
									className="w-6 h-6 text-green-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
									/>
								</svg>
							</div>
							<h1 className="text-2xl font-bold text-gray-900 mb-2">
								Connect a WhatsApp number
							</h1>
							<p className="text-sm text-gray-500 mb-6">
								Give this session a label (e.g. the employee&apos;s name), then
								scan the QR code in Sessions to activate it.
							</p>
							<input
								type="text"
								value={sessionName}
								onChange={(e) => setSessionName(e.target.value)}
								placeholder="e.g. Mike's Sales Phone"
								className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
								onKeyDown={(e) => {
									if (e.key === "Enter" && sessionName.trim())
										createSession.mutate({ name: sessionName.trim() });
								}}
							/>
							{createSession.error && (
								<p className="text-xs text-red-500 mt-2">
									{createSession.error.message}
								</p>
							)}
							<button
								onClick={() =>
									createSession.mutate({ name: sessionName.trim() })
								}
								disabled={!sessionName.trim() || createSession.isPending}
								className="mt-4 w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
							>
								{createSession.isPending ? "Creating…" : "Create session"}
							</button>
							<button
								onClick={() => setStep("done")}
								className="mt-2 w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
							>
								Skip for now
							</button>
						</>
					)}

					{step === "done" && (
						<div className="text-center">
							<div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
								<svg
									className="w-8 h-8 text-green-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M5 13l4 4L19 7"
									/>
								</svg>
							</div>
							<h1 className="text-2xl font-bold text-gray-900 mb-2">
								You&apos;re all set!
							</h1>
							<p className="text-sm text-gray-500 mb-8">
								Head to your dashboard. Once a session is connected, Claude will
								automatically detect to-dos from WhatsApp conversations.
							</p>
							<button
								onClick={() => router.push("/dashboard")}
								className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm"
							>
								Go to dashboard
							</button>
						</div>
					)}
				</div>

				{step !== "done" && (
					<p className="text-xs text-center text-gray-400 mt-4">
						Step {stepIndex + 1} of {steps.length - 1}
					</p>
				)}
			</div>
		</div>
	);
}
