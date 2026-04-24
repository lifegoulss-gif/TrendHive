"use client";

import { usePusherChannel } from "@/hooks/usePusherChannel";
import { trpc } from "@/trpc/client";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

const statusConfig: Record<
	string,
	{ label: string; dot: string; className: string }
> = {
	CONNECTED: {
		label: "Connected",
		dot: "bg-emerald-500 animate-pulse",
		className: "text-emerald-700 bg-emerald-50 border-emerald-200",
	},
	CONNECTING: {
		label: "Connecting…",
		dot: "bg-amber-400 animate-pulse",
		className: "text-amber-700 bg-amber-50 border-amber-200",
	},
	DISCONNECTED: {
		label: "Disconnected",
		dot: "bg-zinc-400",
		className: "text-zinc-600 bg-zinc-50 border-zinc-200",
	},
	ERROR: {
		label: "Error",
		dot: "bg-red-500",
		className: "text-red-700 bg-red-50 border-red-200",
	},
};

export default function SessionsPage() {
	const [showConnect, setShowConnect] = useState(false);
	const [step, setStep] = useState<"consent" | "qr">("consent");
	const [sessionName, setSessionName] = useState("");
	const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
	const [qrExpired, setQrExpired] = useState(false);
	const [waitSeconds, setWaitSeconds] = useState(0);
	const [search, setSearch] = useState("");
	const lastQrRef = useRef<string | null>(null);
	const qrExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const waitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const { data: org } = trpc.org.getCurrent.useQuery(undefined, {
		staleTime: 60_000,
	});
	const { data: sessions, refetch } = trpc.session.list.useQuery(undefined, {
		staleTime: 3_000,
		// Poll faster when any session is in a transitional state
		refetchInterval: (query) => {
			const data = query.state.data;
			if (!data) return 3_000;
			return data.some((s) => s.status === "CONNECTING") ? 3_000 : 8_000;
		},
	});

	const createMutation = trpc.session.create.useMutation({
		onSuccess: (session) => {
			setPendingSessionId(session.id);
			setStep("qr");
			startWaitTimer();
			refetch();
		},
	});
	const disconnectMutation = trpc.session.disconnect.useMutation({
		onSuccess: () => refetch(),
	});
	const reconnectMutation = trpc.session.reconnect.useMutation({
		onSuccess: (session) => {
			setQrDataUrl(null);
			lastQrRef.current = null;
			setQrExpired(false);
			setPendingSessionId(session.id);
			setStep("qr");
			setShowConnect(true);
			startWaitTimer();
			refetch();
		},
	});
	const forceResetMutation = trpc.session.forceReset.useMutation({
		onSuccess: () => refetch(),
	});
	const deleteMutation = trpc.session.delete.useMutation({
		onSuccess: () => refetch(),
	});

	function startWaitTimer() {
		setWaitSeconds(0);
		if (waitTimerRef.current) clearInterval(waitTimerRef.current);
		waitTimerRef.current = setInterval(
			() => setWaitSeconds((s) => s + 1),
			1000,
		);
	}

	// Poll DB every 3s while QR modal is open.
	// Keep polling even after QR is shown — WhatsApp refreshes QR every ~20s.
	const { data: qrPoll } = trpc.session.getQr.useQuery(pendingSessionId ?? "", {
		enabled: !!pendingSessionId,
		refetchInterval: 3000,
		refetchIntervalInBackground: true,
		staleTime: 0,
	});

	useEffect(() => {
		if (!qrPoll) return;

		// New QR arrived (different from the one we last rendered)
		if (qrPoll.qr && qrPoll.qr !== lastQrRef.current) {
			lastQrRef.current = qrPoll.qr;
			setQrExpired(false);

			// Clear previous expiry timer
			if (qrExpiryTimer.current) clearTimeout(qrExpiryTimer.current);

			QRCode.toDataURL(qrPoll.qr, { width: 256, margin: 1 })
				.then(setQrDataUrl)
				.catch(console.error);

			// WhatsApp QR codes expire after ~25s; show "expired" if no refresh
			qrExpiryTimer.current = setTimeout(() => setQrExpired(true), 25_000);
		}

		if (qrPoll.status === "CONNECTED") {
			refetch();
			handleClose();
		}

		if (qrPoll.status === "ERROR") {
			refetch();
		}
	}, [qrPoll?.qr, qrPoll?.status]); // eslint-disable-line react-hooks/exhaustive-deps

	// Pusher as a faster parallel path (best-effort)
	usePusherChannel<{ sessionId: string; qr: string }>(
		org ? `private-${org.id}-sessions` : null,
		"session.qr",
		({ sessionId, qr }) => {
			if (sessionId === pendingSessionId && qr !== lastQrRef.current) {
				lastQrRef.current = qr;
				setQrExpired(false);
				if (qrExpiryTimer.current) clearTimeout(qrExpiryTimer.current);
				QRCode.toDataURL(qr, { width: 256, margin: 1 })
					.then(setQrDataUrl)
					.catch(console.error);
				qrExpiryTimer.current = setTimeout(() => setQrExpired(true), 25_000);
			}
		},
	);
	usePusherChannel<{ sessionId: string }>(
		org ? `private-${org.id}-sessions` : null,
		"session.connected",
		() => {
			refetch();
			handleClose();
		},
	);
	usePusherChannel<{ sessionId: string }>(
		org ? `private-${org.id}-sessions` : null,
		"session.error",
		() => refetch(),
	);
	usePusherChannel<{ sessionId: string }>(
		org ? `private-${org.id}-sessions` : null,
		"session.disconnected",
		() => refetch(),
	);

	function handleConsent() {
		if (createMutation.isPending) return;
		createMutation.mutate({ name: sessionName.trim() || undefined });
	}

	function handleClose() {
		setShowConnect(false);
		setStep("consent");
		setSessionName("");
		setPendingSessionId(null);
		setQrDataUrl(null);
		setQrExpired(false);
		setWaitSeconds(0);
		lastQrRef.current = null;
		if (qrExpiryTimer.current) clearTimeout(qrExpiryTimer.current);
		if (waitTimerRef.current) clearInterval(waitTimerRef.current);
	}

	const anyPending =
		disconnectMutation.isPending ||
		reconnectMutation.isPending ||
		forceResetMutation.isPending ||
		deleteMutation.isPending;

	const filtered = (sessions ?? []).filter((s) => {
		if (!search.trim()) return true;
		const q = search.toLowerCase();
		return (
			(s.name ?? "").toLowerCase().includes(q) ||
			(s.phoneNumber ?? "").includes(q)
		);
	});

	const connectedCount = (sessions ?? []).filter((s) => s.status === "CONNECTED").length;
	const connectingCount = (sessions ?? []).filter((s) => s.status === "CONNECTING").length;
	const disconnectedCount = (sessions ?? []).filter(
		(s) => s.status === "DISCONNECTED" || s.status === "ERROR",
	).length;

	return (
		<div className="p-8 max-w-4xl">
			<div className="flex items-start justify-between mb-6">
				<div>
					<p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
						Sessions
					</p>
					<h1 className="text-2xl font-semibold text-zinc-950 tracking-tight">
						WhatsApp Sessions
					</h1>
					<p className="text-sm text-zinc-500 mt-1">
						One session per employee WhatsApp number
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						setShowConnect(true);
						setStep("consent");
						setSessionName("");
					}}
					className="flex items-center gap-2 px-4 py-2.5 bg-zinc-950 text-white text-[13px] font-semibold rounded-xl hover:bg-zinc-800 transition-colors"
				>
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
							strokeWidth={2.5}
							d="M12 4v16m8-8H4"
						/>
					</svg>
					Connect number
				</button>
			</div>

			{/* Stats bar */}
			{sessions && sessions.length > 0 && (
				<div className="grid grid-cols-3 gap-3 mb-5">
					{[
						{
							label: "Connected",
							count: connectedCount,
							dot: "bg-emerald-500",
							text: "text-emerald-700",
							bg: "bg-emerald-50 border-emerald-100",
						},
						{
							label: "Linking…",
							count: connectingCount,
							dot: "bg-amber-400",
							text: "text-amber-700",
							bg: "bg-amber-50 border-amber-100",
						},
						{
							label: "Offline",
							count: disconnectedCount,
							dot: "bg-zinc-300",
							text: "text-zinc-600",
							bg: "bg-zinc-50 border-zinc-100",
						},
					].map(({ label, count, dot, text, bg }) => (
						<div
							key={label}
							className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bg}`}
						>
							<span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
							<div>
								<p className={`text-xl font-bold ${text}`}>{count}</p>
								<p className="text-[11px] text-zinc-400 font-medium">{label}</p>
							</div>
						</div>
					))}
				</div>
			)}

			{/* Search */}
			{sessions && sessions.length > 3 && (
				<div className="mb-3 relative">
					<svg
						className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M21 21l-4.35-4.35M17 11A6 6 0 1 0 5 11a6 6 0 0 0 12 0z"
						/>
					</svg>
					<input
						type="text"
						placeholder="Search by name or phone…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-[13px] text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 transition-colors"
					/>
				</div>
			)}

			{/* Sessions table */}
			<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
				{!sessions || sessions.length === 0 ? (
					<div className="py-20 text-center">
						<div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3">
							<svg
								className="w-6 h-6 text-zinc-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.75}
									d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
								/>
							</svg>
						</div>
						<p className="text-sm font-medium text-zinc-600">No sessions yet</p>
						<p className="text-xs text-zinc-400 mt-1">
							Click "Connect number" to link an employee's WhatsApp
						</p>
					</div>
				) : filtered.length === 0 && search ? (
					<div className="py-12 text-center">
						<p className="text-sm text-zinc-500">No sessions match &ldquo;{search}&rdquo;</p>
						<button
							type="button"
							onClick={() => setSearch("")}
							className="text-[12px] text-indigo-600 mt-1 hover:underline"
						>
							Clear search
						</button>
					</div>
				) : (
					<table className="w-full">
						<thead>
							<tr className="border-b border-zinc-100">
								<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">
									Name
								</th>
								<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">
									Phone
								</th>
								<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">
									Status
								</th>
								<th className="text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">
									Last connected
								</th>
								<th className="text-right text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-6 py-3.5">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{filtered.map((s) => {
								const cfg = statusConfig[s.status] ?? statusConfig.DISCONNECTED;
								return (
									<tr
										key={s.id}
										className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors"
									>
										<td className="px-6 py-4 text-[13px] font-medium text-zinc-900">
											{s.name ?? "Unnamed"}
											{s.errorMessage && (
												<p className="text-[11px] text-red-500 mt-0.5 font-normal">
													{s.errorMessage}
												</p>
											)}
										</td>
										<td className="px-6 py-4 text-[13px] text-zinc-500 font-mono">
											{s.phoneNumber ?? "—"}
										</td>
										<td className="px-6 py-4">
											<span
												className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.className}`}
											>
												<span
													className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}
												/>
												{cfg.label}
											</span>
										</td>
										<td className="px-6 py-4 text-[13px] text-zinc-500">
											{s.lastConnectedAt
												? new Date(s.lastConnectedAt).toLocaleDateString(
														"en-US",
														{ month: "short", day: "numeric", year: "numeric" },
													)
												: "—"}
										</td>
										<td className="px-6 py-4">
											<div className="flex items-center justify-end gap-3">
												{s.status === "CONNECTING" && (
													<>
														<button
															type="button"
															onClick={() => setPendingSessionId(s.id)}
															disabled={anyPending}
															className="text-[13px] text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:opacity-40"
														>
															Scan QR
														</button>
														<button
															type="button"
															onClick={() => forceResetMutation.mutate(s.id)}
															disabled={anyPending}
															className="text-[13px] text-zinc-400 hover:text-zinc-700 font-medium transition-colors disabled:opacity-40"
															title="Cancel and reset to disconnected"
														>
															Cancel
														</button>
													</>
												)}
												{s.status === "CONNECTED" && (
													<button
														type="button"
														onClick={() => disconnectMutation.mutate(s.id)}
														disabled={anyPending}
														className="text-[13px] text-red-500 hover:text-red-700 font-medium disabled:opacity-40 transition-colors"
													>
														Disconnect
													</button>
												)}
												{(s.status === "DISCONNECTED" ||
													s.status === "ERROR") && (
													<button
														type="button"
														onClick={() => reconnectMutation.mutate(s.id)}
														disabled={anyPending}
														className="text-[13px] text-emerald-600 hover:text-emerald-800 font-semibold transition-colors disabled:opacity-40"
													>
														Reconnect
													</button>
												)}
												<button
													type="button"
													onClick={() => {
														if (
															confirm(
																`Delete session "${s.name ?? "Unnamed"}"? This cannot be undone.`,
															)
														) {
															deleteMutation.mutate(s.id);
														}
													}}
													disabled={anyPending}
													className="text-zinc-300 hover:text-red-500 transition-colors disabled:opacity-40 p-1 rounded"
													title="Delete session"
												>
													<svg
														className="w-4 h-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													aria-hidden="true"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
														/>
													</svg>
												</button>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>

			{/* How it works */}
			<div className="mt-4 bg-zinc-50 border border-zinc-200 rounded-xl px-5 py-4">
				<p className="text-[12px] font-semibold text-zinc-600 mb-2">
					How it works
				</p>
				<div className="flex items-start gap-6 flex-wrap">
					{[
						{ n: "1", text: 'Click "Connect number"' },
						{ n: "2", text: "Employee scans QR on their phone" },
						{ n: "3", text: "All messages captured automatically" },
						{
							n: "4",
							text: "Stay connected — only need to re-scan if WhatsApp logs out",
						},
					].map(({ n, text }) => (
						<div key={n} className="flex items-start gap-2">
							<span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
								{n}
							</span>
							<p className="text-[12px] text-zinc-500">{text}</p>
						</div>
					))}
				</div>
			</div>

			{/* Modal */}
			{showConnect && (
				<div
					className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
					onClick={handleClose}
				>
					<div
						className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-zinc-200"
						onClick={(e) => e.stopPropagation()}
					>
						{step === "consent" ? (
							<>
								<div className="mb-5">
									<h2 className="text-base font-semibold text-zinc-950">
										Connect WhatsApp
									</h2>
									<p className="text-[13px] text-zinc-500 mt-0.5">
										Link an employee's phone to this workspace
									</p>
								</div>

								<div className="mb-4">
									<label className="text-xs font-medium text-zinc-500 block mb-1.5">
										Session name{" "}
										<span className="text-zinc-300">(optional)</span>
									</label>
									<input
										type="text"
										placeholder="e.g. Ahmed's Sales Phone"
										value={sessionName}
										onChange={(e) => setSessionName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleConsent();
										}}
										className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-[13px] text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 transition-colors"
									/>
								</div>

								<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
									<p className="text-[13px] font-semibold text-amber-900 mb-1">
										Employee consent required
									</p>
									<p className="text-xs text-amber-700 leading-relaxed">
										By connecting this number, the employee confirms they
										consent to their WhatsApp messages being monitored and
										stored for business purposes.
									</p>
								</div>

								<div className="space-y-2 mb-5">
									{[
										"Messages visible to managers in this dashboard",
										"AI will auto-detect to-dos from conversations",
										"You can disconnect at any time",
									].map((item) => (
										<div key={item} className="flex items-start gap-2.5">
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
											<p className="text-[13px] text-zinc-600">{item}</p>
										</div>
									))}
								</div>

								{createMutation.isError && (
									<p className="text-[12px] text-red-500 mb-3">
										{createMutation.error.message}
									</p>
								)}

								<div className="flex gap-2.5">
									<button
										type="button"
										onClick={handleClose}
										className="flex-1 py-2.5 text-[13px] font-medium text-zinc-600 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
									>								</button>
									<button
										type="button"
										onClick={handleConsent}
										disabled={createMutation.isPending}
										className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-zinc-950 rounded-xl hover:bg-zinc-800 transition-colors disabled:opacity-50"
									>
						{createMutation.isPending
							? "Starting…"
							: "I Consent — Continue"}
									</button>
								</div>
							</>
						) : (
							<>
								<div className="mb-4">
									<h2 className="text-base font-semibold text-zinc-950">
										Scan QR Code
									</h2>
									{qrDataUrl ? (
										<p className="text-[13px] text-zinc-500 mt-0.5">
											Open WhatsApp → <strong>Linked Devices</strong> →{" "}
											<strong>Link a Device</strong>
										</p>
									) : (
										<p className="text-[13px] text-zinc-500 mt-0.5">
											Starting WhatsApp — this takes{" "}
											<strong>30–60 seconds</strong>
										</p>
									)}
								</div>

								{/* Startup progress bar — shown only while waiting for QR */}
								{!qrDataUrl && (
									<div className="mb-4">
										<div className="flex items-center justify-between mb-1.5">
											<span className="text-[11px] text-zinc-500 font-medium">
												{waitSeconds < 10
													? "Launching browser…"
													: waitSeconds < 25
														? "Loading WhatsApp Web…"
														: waitSeconds < 45
															? "Almost ready…"
															: "Taking longer than usual — please wait…"}
											</span>
											<span className="text-[11px] text-zinc-400 font-mono">
												{waitSeconds}s
											</span>
										</div>
										<div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
											<div
												className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
												style={{
													width: `${Math.min((waitSeconds / 60) * 100, 95)}%`,
												}}
											/>
										</div>
									</div>
								)}

								<div className="border border-zinc-200 rounded-xl p-4 flex flex-col items-center gap-3 mb-4 bg-zinc-50">
									<div className="w-52 h-52 bg-white border-2 border-zinc-200 rounded-xl flex items-center justify-center overflow-hidden relative">
										{qrDataUrl ? (
											<>
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img
													src={qrDataUrl}
													alt="WhatsApp QR code"
													className={`w-full h-full object-contain transition-opacity ${qrExpired ? "opacity-25" : "opacity-100"}`}
												/>
												{qrExpired && (
													<div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85">
														<svg
															className="w-5 h-5 text-amber-500 mb-1.5 animate-spin"
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
														<p className="text-[12px] font-semibold text-amber-700">
															QR expired
														</p>
														<p className="text-[11px] text-zinc-500 mt-0.5">
															Refreshing in a moment…
														</p>
													</div>
												)}
											</>
										) : (
											<div className="flex flex-col items-center gap-3 px-4 text-center">
												<svg
													className="w-7 h-7 text-zinc-300 animate-spin"
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
												<p className="text-[11px] text-zinc-400 leading-relaxed">
													Starting WhatsApp Web in a headless browser.
													<br />
													QR appears in ~30–60 seconds.
												</p>
											</div>
										)}
									</div>

									{qrDataUrl && !qrExpired && (
										<p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1.5">
											<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
											Scan with WhatsApp now — refreshes every 20s
										</p>
									)}

									{qrPoll?.status === "ERROR" && (
										<p className="text-[11px] text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
											Error — close this and click Reconnect to try again
										</p>
									)}
								</div>

								{/* Step-by-step scan guide */}
								{qrDataUrl && (
									<div className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 mb-4">
										<p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
											How to scan
										</p>
										<ol className="space-y-2">
											<li className="flex items-start gap-2.5">
												<span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
												<p className="text-[12px] text-zinc-500">Open WhatsApp on your phone</p>
											</li>
											<li className="flex items-start gap-2.5">
												<span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
												<p className="text-[12px] text-zinc-500 leading-relaxed">
													<span className="font-medium text-zinc-700">Android:</span> tap ⋮ → Linked Devices
													<br />
													<span className="font-medium text-zinc-700">iPhone:</span> Settings → Linked Devices
												</p>
											</li>
											<li className="flex items-start gap-2.5">
												<span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
												<p className="text-[12px] text-zinc-500">Tap &ldquo;Link a Device&rdquo; and point camera at the QR above</p>
											</li>
										</ol>
									</div>
								)}

								<button
									type="button"
									onClick={handleClose}
									className="w-full py-2.5 text-[13px] font-medium text-zinc-600 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
								>					</button>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
