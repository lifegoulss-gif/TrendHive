"use client";

import { trpc } from "@/trpc/client";
import { useEffect, useState } from "react";

function CopyField({ value, label }: { value: string; label: string }) {
	const [copied, setCopied] = useState(false);
	function copy() {
		navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}
	return (
		<div>
			<p className="text-xs font-medium text-zinc-500 block mb-1.5">{label}</p>
			<div className="flex items-center gap-2">
				<p className="flex-1 text-[13px] text-zinc-500 font-mono bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 truncate">
					{value}
				</p>
				<button
					type="button"
					onClick={copy}
					className="shrink-0 px-3 py-2 text-[12px] font-medium text-zinc-500 hover:text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors"
				>
					{copied ? "Copied!" : "Copy"}
				</button>
			</div>
		</div>
	);
}

export default function SettingsPage() {
	const { data: org, isLoading } = trpc.org.getCurrent.useQuery(undefined, {
		staleTime: 60_000,
	});
	const { data: sessions } = trpc.session.list.useQuery(undefined, {
		staleTime: 30_000,
	});
	const updateMutation = trpc.org.update.useMutation();

	const [name, setName] = useState("");
	useEffect(() => {
		if (org) setName(org.name);
	}, [org]);

	function handleSave() {
		if (!name.trim() || name.trim() === org?.name) return;
		updateMutation.mutate({ name: name.trim() });
	}

	return (
		<div className="p-8 max-w-2xl space-y-4">
			<div className="mb-8">
				<p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
					Settings
				</p>
				<h1 className="text-2xl font-semibold text-zinc-950 tracking-tight">
					Workspace
				</h1>
				<p className="text-sm text-zinc-500 mt-1">
					Manage your organization details and configuration
				</p>
			</div>

			{/* Organization */}
			<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
				<div className="px-6 py-5 border-b border-zinc-100">
					<h2 className="text-[13px] font-semibold text-zinc-900">
						Organization
					</h2>
					<p className="text-xs text-zinc-400 mt-0.5">
						Your workspace identity
					</p>
				</div>
				<div className="px-6 py-5 space-y-4">
					{isLoading ? (
						<div className="space-y-3">
							<div className="h-9 bg-zinc-100 rounded-xl animate-pulse" />
							<div className="h-9 bg-zinc-100 rounded-xl animate-pulse opacity-60" />
						</div>
					) : (
						<>
							<div>
								<label
									htmlFor="org-name"
									className="text-xs font-medium text-zinc-500 block mb-1.5"
								>
									Organization name
								</label>
								<input
									id="org-name"
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleSave();
									}}
									className="w-full border border-zinc-200 rounded-xl px-3.5 py-2.5 text-[13px] text-zinc-900 focus:outline-none focus:border-zinc-400 transition-colors"
								/>
							</div>
							{org?.slug && <CopyField value={org.slug} label="Slug" />}
							{org?.id && <CopyField value={org.id} label="Organization ID" />}
						</>
					)}
				</div>
				<div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between bg-zinc-50">
					<div>
						{updateMutation.isSuccess && (
							<p className="text-[13px] text-emerald-600 font-medium flex items-center gap-1.5">
								<svg
									className="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M5 13l4 4L19 7"
									/>
								</svg>
								Saved
							</p>
						)}
						{updateMutation.isError && (
							<p className="text-[13px] text-red-500">
								{updateMutation.error.message}
							</p>
						)}
					</div>
					<button
						type="button"
						onClick={handleSave}
						disabled={
							updateMutation.isPending ||
							isLoading ||
							!name.trim() ||
							name.trim() === org?.name
						}
						className="px-4 py-2 bg-zinc-950 text-white text-[13px] font-semibold rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-40"
					>
						{updateMutation.isPending ? "Saving…" : "Save changes"}
					</button>
				</div>
			</div>

			{/* WhatsApp sessions summary */}
			<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
				<div className="px-6 py-5 border-b border-zinc-100">
					<h2 className="text-[13px] font-semibold text-zinc-900">
						WhatsApp sessions
					</h2>
					<p className="text-xs text-zinc-400 mt-0.5">
						Active connections to WhatsApp
					</p>
				</div>
				{!sessions ? (
					<div className="px-6 py-5">
						<div className="h-8 bg-zinc-100 rounded-lg animate-pulse" />
					</div>
				) : sessions.length === 0 ? (
					<div className="px-6 py-5">
						<p className="text-[13px] text-zinc-400">No sessions configured.</p>
						<a
							href="/dashboard/sessions"
							className="text-[13px] text-indigo-600 hover:text-indigo-800 font-medium mt-1 inline-block"
						>
							Add a session →
						</a>
					</div>
				) : (
					<div className="divide-y divide-zinc-100">
						{sessions.map((s) => (
							<div
								key={s.id}
								className="px-6 py-4 flex items-center justify-between"
							>
								<div className="flex items-center gap-3">
									<span
										className={`w-2 h-2 rounded-full ${
											s.status === "CONNECTED"
												? "bg-emerald-500 animate-pulse"
												: s.status === "CONNECTING"
													? "bg-amber-400 animate-pulse"
													: s.status === "ERROR"
														? "bg-red-500"
														: "bg-zinc-300"
										}`}
									/>
									<div>
										<p className="text-[13px] font-medium text-zinc-900">
											{s.name ?? s.phoneNumber ?? s.id.slice(0, 8)}
										</p>
										{s.phoneNumber && (
											<p className="text-[11px] text-zinc-400 font-mono">
												{s.phoneNumber}
											</p>
										)}
									</div>
								</div>
								<span
									className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
										s.status === "CONNECTED"
											? "bg-emerald-50 text-emerald-700 border border-emerald-200"
											: s.status === "CONNECTING"
												? "bg-amber-50 text-amber-700 border border-amber-200"
												: s.status === "ERROR"
													? "bg-red-50 text-red-700 border border-red-200"
													: "bg-zinc-100 text-zinc-500"
									}`}
								>
									{s.status.charAt(0) + s.status.slice(1).toLowerCase()}
								</span>
							</div>
						))}
					</div>
				)}
				<div className="px-6 py-3 bg-zinc-50 border-t border-zinc-100">
					<a
						href="/dashboard/sessions"
						className="text-[12px] text-zinc-500 hover:text-zinc-800 font-medium transition-colors"
					>
						Manage sessions →
					</a>
				</div>
			</div>

			{/* AI configuration info */}
			<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
				<div className="px-6 py-5 border-b border-zinc-100">
					<h2 className="text-[13px] font-semibold text-zinc-900">
						AI configuration
					</h2>
					<p className="text-xs text-zinc-400 mt-0.5">
						How customer messages are processed
					</p>
				</div>
				<div className="px-6 py-5 space-y-4">
					<div className="grid grid-cols-2 gap-4">
						{[
							{ label: "Todo capture", value: "100% of inbound messages" },
							{ label: "AI enrichment", value: "5s after receipt" },
							{ label: "AI model", value: "Claude Haiku" },
							{ label: "Spam detection", value: "Auto-flagged, kept visible" },
						].map(({ label, value }) => (
							<div key={label} className="bg-zinc-50 rounded-xl p-3">
								<p className="text-[11px] text-zinc-400 font-medium">{label}</p>
								<p className="text-[13px] text-zinc-800 font-semibold mt-0.5">
									{value}
								</p>
							</div>
						))}
					</div>
					<p className="text-[11px] text-zinc-400">
						Every customer message is instantly captured as a task and enriched
						by Claude within 5 seconds. Spam is flagged with LOW priority but
						not deleted — your team makes the final call.
					</p>
				</div>
			</div>

			{/* Danger Zone */}
			<div className="bg-white border border-red-100 rounded-xl overflow-hidden">
				<div className="px-6 py-5 border-b border-red-100">
					<h2 className="text-[13px] font-semibold text-zinc-900">
						Danger zone
					</h2>
					<p className="text-xs text-zinc-400 mt-0.5">
						Irreversible actions — proceed with caution
					</p>
				</div>
				<div className="px-6 py-5 flex items-center justify-between">
					<div>
						<p className="text-[13px] font-medium text-zinc-900">
							Delete organization
						</p>
						<p className="text-xs text-zinc-400 mt-0.5">
							Permanently removes this workspace, all sessions, messages, and
							tasks
						</p>
					</div>
					<button
						type="button"
						onClick={() =>
							confirm("Are you absolutely sure? This cannot be undone.")
						}
						className="px-4 py-2 text-[13px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	);
}
