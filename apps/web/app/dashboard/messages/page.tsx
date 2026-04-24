"use client";

import { usePusherChannel } from "@/hooks/usePusherChannel";
import { trpc } from "@/trpc/client";
import { useEffect, useRef, useState } from "react";

const avatarColors = [
	"from-indigo-400 to-indigo-600",
	"from-violet-400 to-violet-600",
	"from-sky-400 to-sky-600",
	"from-emerald-400 to-emerald-600",
	"from-rose-400 to-rose-600",
	"from-amber-400 to-amber-600",
];

function timeAgo(date: Date | string) {
	const d = new Date(date);
	const diff = Math.floor((Date.now() - d.getTime()) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function msgTime(date: Date | string) {
	return new Date(date).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function phoneInitials(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	return digits.slice(-4, -2);
}

const priorityDot: Record<string, string> = {
	URGENT: "bg-red-500",
	HIGH: "bg-orange-400",
	NORMAL: "bg-amber-400",
	LOW: "bg-zinc-300",
};

const priorityLabel: Record<string, string> = {
	URGENT: "Urgent",
	HIGH: "High",
	NORMAL: "Normal",
	LOW: "Low",
};

export default function MessagesPage() {
	const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
	const [input, setInput] = useState("");
	const [sending, setSending] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);

	const { data: org } = trpc.org.getCurrent.useQuery(undefined, {
		retry: false,
		staleTime: 60_000,
	});
	const { data: sessions } = trpc.session.list.useQuery(undefined, {
		retry: false,
		staleTime: 30_000,
	});

	// Server-side grouped conversations — fast, no 200-message client-side processing
	const { data: conversations, refetch: refetchConvs } =
		trpc.message.conversations.useQuery(
			{},
			{ retry: false, staleTime: 10_000 },
		);

	// Load messages for selected conversation only
	const { data: convMessages, refetch: refetchMsgs } =
		trpc.message.getConversation.useQuery(
			{ contactPhone: selectedPhone ?? "" },
			{ enabled: !!selectedPhone, retry: false, staleTime: 5_000 },
		);

	const sendMutation = trpc.message.send.useMutation();
	const orgId = org?.id;
	const connectedSession = sessions?.find((s) => s.status === "CONNECTED");

	usePusherChannel<{ contactPhone: string }>(
		orgId ? `private-${orgId}-messages` : null,
		"message.new",
		() => {
			refetchConvs();
			refetchMsgs();
		},
	);

	// Keep todo sidebar in sync: AI enrichment can update or delete todos after creation
	usePusherChannel(
		orgId ? `private-${orgId}-todos` : null,
		"todo.updated",
		() => {
			refetchConvs();
		},
	);
	usePusherChannel(
		orgId ? `private-${orgId}-todos` : null,
		"todo.deleted",
		() => {
			refetchConvs();
		},
	);

	// Auto-select first conversation
	useEffect(() => {
		if (!selectedPhone && conversations && conversations.length > 0) {
			setSelectedPhone(conversations[0].contactPhone);
		}
	}, [conversations, selectedPhone]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	// biome-ignore lint/correctness/useExhaustiveDependencies: bottomRef is a stable ref
	}, [convMessages, selectedPhone]);

	const selected = conversations?.find((c) => c.contactPhone === selectedPhone);
	const selectedIdx =
		conversations?.findIndex((c) => c.contactPhone === selectedPhone) ?? 0;

	function sendMessage() {
		if (!input.trim() || sending || !connectedSession || !selected) return;
		const body = input.trim();
		setInput("");
		setSending(true);
		const toPhone = selected.contactPhone.replace(/\D/g, "");
		sendMutation.mutate(
			{ sessionId: connectedSession.id, to: toPhone, text: body },
			{
				onSettled: () => {
					setSending(false);
					refetchMsgs();
					refetchConvs();
				},
			},
		);
	}

	if (!conversations) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<svg
						className="w-5 h-5 text-zinc-400 animate-spin"
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
					<p className="text-sm text-zinc-400">Loading messages…</p>
				</div>
			</div>
		);
	}

	if (conversations.length === 0) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3">
						<svg
							className="w-5 h-5 text-zinc-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.75}
								d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
							/>
						</svg>
					</div>
					<p className="text-sm text-zinc-500">No messages yet</p>
					<p className="text-xs text-zinc-400 mt-1">
						Connect a WhatsApp session to start seeing messages
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-screen">
			{/* Conversation list */}
			<div className="w-72 border-r border-zinc-200 bg-white flex flex-col flex-shrink-0">
				<div className="px-4 pt-8 pb-4 border-b border-zinc-100">
					<h1 className="text-[13px] font-semibold text-zinc-950">Inbox</h1>
					<p className="text-xs text-zinc-400 mt-0.5">
						{conversations.length} conversations
					</p>
				</div>
				<div className="flex-1 overflow-y-auto">
					{conversations.map((conv, i) => (
						<button
							type="button"
							key={conv.contactPhone}
							onClick={() => setSelectedPhone(conv.contactPhone)}
							className={`w-full text-left px-4 py-3 border-b border-zinc-100 hover:bg-zinc-50 transition-colors ${
								selectedPhone === conv.contactPhone
									? "bg-zinc-50 border-l-2 border-l-indigo-500"
									: ""
							}`}
						>
							<div className="flex items-start gap-3">
								<div
									className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[11px] font-bold shrink-0`}
								>
									{phoneInitials(conv.contactPhone)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-2">
										<span className="text-[13px] font-semibold text-zinc-800 truncate font-mono">
											{conv.contactPhone}
										</span>
										<span className="text-[11px] text-zinc-400 shrink-0">
											{timeAgo(conv.lastTimestamp)}
										</span>
									</div>
									<p className="text-xs text-zinc-400 truncate mt-0.5">
										{conv.lastMessage}
									</p>
									{conv.latestTodo && (
										<div className="flex items-center gap-1.5 mt-1">
											<span
												className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[conv.latestTodo.priority] ?? "bg-zinc-300"}`}
											/>
											<span className="text-[10px] text-zinc-500 truncate">
												{conv.latestTodo.title}
											</span>
										</div>
									)}
								</div>
							</div>
						</button>
					))}
				</div>
			</div>

			{/* Chat window */}
			{selected && (
				<>
					<div className="flex-1 flex flex-col bg-zinc-50 min-w-0">
						{/* Header */}
						<div className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
							<div className="flex items-center gap-3">
								<div
									className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColors[selectedIdx % avatarColors.length]} flex items-center justify-center text-white text-[11px] font-bold`}
								>
									{phoneInitials(selected.contactPhone)}
								</div>
								<div>
									<h2 className="text-[13px] font-semibold text-zinc-950 font-mono">
										{selected.contactPhone}
									</h2>
									<p className="text-xs text-zinc-400">WhatsApp customer</p>
								</div>
							</div>
							{connectedSession && (
								<span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
									<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
									Connected
								</span>
							)}
						</div>

						{/* Messages */}
						<div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
							{!convMessages ? (
								<div className="flex justify-center py-12">
									<svg
										className="w-5 h-5 text-zinc-300 animate-spin"
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
								</div>
							) : convMessages.length === 0 ? (
								<p className="text-center text-xs text-zinc-400 py-12">
									No messages in this conversation
								</p>
							) : (
								convMessages.map((msg) => (
									<div
										key={msg.id}
										className={`flex ${msg.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
									>
										<div
											className={`max-w-xs lg:max-w-md px-3.5 py-2.5 text-[13px] ${
												msg.direction === "OUTBOUND"
													? "bg-zinc-950 text-white rounded-2xl rounded-br-md"
													: "bg-white text-zinc-800 border border-zinc-200 rounded-2xl rounded-bl-md shadow-sm"
											}`}
										>
											<p className="leading-relaxed whitespace-pre-wrap">
												{msg.text}
											</p>
											<p
												className={`text-[11px] mt-1.5 ${msg.direction === "OUTBOUND" ? "text-zinc-500" : "text-zinc-400"}`}
											>
												{msgTime(msg.timestamp)}
											</p>
										</div>
									</div>
								))
							)}
							{sending && (
								<div className="flex justify-end">
									<div className="bg-zinc-800 px-4 py-3 rounded-2xl rounded-br-md flex gap-1 items-center">
										<span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]" />
										<span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]" />
										<span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]" />
									</div>
								</div>
							)}
							<div ref={bottomRef} />
						</div>

						{/* Input */}
						<div className="bg-white border-t border-zinc-200 px-5 py-4 flex-shrink-0">
							<div className="flex items-center gap-3 border border-zinc-200 rounded-xl px-4 py-2.5 focus-within:border-zinc-400 transition-colors">
								<input
									type="text"
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											sendMessage();
										}
									}}
									placeholder="Type a message…"
									className="flex-1 bg-transparent text-[13px] text-zinc-800 placeholder-zinc-400 outline-none"
								/>
								<button
									type="button"
									onClick={sendMessage}
									disabled={!input.trim() || sending || !connectedSession}
									className="w-7 h-7 bg-zinc-950 rounded-lg flex items-center justify-center hover:bg-zinc-700 transition-colors disabled:opacity-30"
								>
									<svg
										className="w-3.5 h-3.5 text-white"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
										/>
									</svg>
								</button>
							</div>
							{!connectedSession && (
								<p className="text-[11px] text-zinc-400 mt-2 text-center">
									Connect a WhatsApp session in{" "}
									<a
										href="/dashboard/sessions"
										className="text-zinc-600 hover:text-zinc-900 underline underline-offset-2"
									>
										Sessions
									</a>{" "}
									to send messages
								</p>
							)}
						</div>
					</div>

					{/* AI To-Do panel */}
					<div className="w-64 border-l border-zinc-200 bg-white flex flex-col flex-shrink-0">
						<div className="px-4 pt-8 pb-4 border-b border-zinc-100">
							<div className="flex items-center gap-2">
								<svg
									className="w-3.5 h-3.5 text-indigo-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M13 10V3L4 14h7v7l9-11h-7z"
									/>
								</svg>
								<h3 className="text-[13px] font-semibold text-zinc-900">
									Action Required
								</h3>
							</div>
						</div>
						<div className="p-4 flex-1 overflow-y-auto">
							{selected.latestTodo ? (
								<div className="space-y-3">
									<div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
										<p className="text-[13px] font-medium text-zinc-900 leading-snug">
											{selected.latestTodo.title}
										</p>
										{selected.latestTodo.dueDate && (
											<p className="text-[11px] text-zinc-400 mt-2 flex items-center gap-1">
												<svg
													className="w-3 h-3"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												aria-hidden="true"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
													/>
												</svg>
												{new Date(
													selected.latestTodo.dueDate,
												).toLocaleDateString()}
											</p>
										)}
										<div className="flex items-center gap-1.5 mt-2">
											<span
												className={`w-1.5 h-1.5 rounded-full ${priorityDot[selected.latestTodo.priority] ?? "bg-zinc-300"}`}
											/>
											<span className="text-[11px] font-medium text-zinc-500">
												{priorityLabel[selected.latestTodo.priority] ??
													selected.latestTodo.priority}
											</span>
										</div>
									</div>
								</div>
							) : (
								<div className="text-center py-8">
									<div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center mx-auto mb-2.5">
										<svg
											className="w-4 h-4 text-zinc-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.75}
												d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
											/>
										</svg>
									</div>
									<p className="text-xs text-zinc-400 leading-relaxed">
										No action items detected in this conversation yet
									</p>
								</div>
							)}
						</div>
						<div className="px-4 py-3 border-t border-zinc-100">
							<p className="text-[11px] text-zinc-400 text-center">
								Powered by Claude AI · auto-enriched
							</p>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
