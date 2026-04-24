"use client";

import { usePusherChannel } from "@/hooks/usePusherChannel";
import { trpc } from "@/trpc/client";
import Link from "next/link";
import { useMemo } from "react";

type PusherTodoEvent = { todoId: string; title: string; priority: string };
type PusherMessageEvent = { contactPhone: string };

const priorityConfig: Record<
	string,
	{ dot: string; text: string; label: string }
> = {
	URGENT: { dot: "bg-red-500", text: "text-red-600", label: "Urgent" },
	HIGH: { dot: "bg-orange-400", text: "text-orange-600", label: "High" },
	NORMAL: { dot: "bg-amber-400", text: "text-amber-600", label: "Normal" },
	LOW: { dot: "bg-zinc-300", text: "text-zinc-400", label: "Low" },
};

const avatarColors = [
	"from-indigo-400 to-indigo-600",
	"from-violet-400 to-violet-600",
	"from-sky-400 to-sky-600",
	"from-emerald-400 to-emerald-600",
];

function timeAgo(date: Date | string) {
	const d = new Date(date);
	const diff = Math.floor((Date.now() - d.getTime()) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function phoneInitials(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	return digits.slice(-4, -2) || "??";
}

export default function DashboardPage() {
	const { data: org } = trpc.org.getCurrent.useQuery(undefined, {
		retry: false,
		staleTime: 60_000,
	});
	const { data: sessions } = trpc.session.list.useQuery(undefined, {
		retry: false,
		staleTime: 30_000,
	});
	const { data: openTodos, refetch: refetchTodos } = trpc.todo.list.useQuery(
		{ completed: false },
		{ retry: false, staleTime: 15_000 },
	);
	const { data: conversations, refetch: refetchConvs } =
		trpc.message.conversations.useQuery(
			{},
			{ retry: false, staleTime: 15_000 },
		);

	const orgId = org?.id;

	usePusherChannel<PusherTodoEvent>(
		orgId ? `private-${orgId}-todos` : null,
		"todo.new",
		() => refetchTodos(),
	);
	usePusherChannel<PusherTodoEvent>(
		orgId ? `private-${orgId}-todos` : null,
		"todo.updated",
		() => refetchTodos(),
	);
	usePusherChannel<PusherMessageEvent>(
		orgId ? `private-${orgId}-messages` : null,
		"message.new",
		() => refetchConvs(),
	);

	const connectedSessions =
		sessions?.filter((s) => s.status === "CONNECTED").length ?? 0;
	const totalSessions = sessions?.length ?? 0;
	const hasSessionIssues = sessions?.some((s) => s.status === "ERROR") ?? false;

	const messagesToday = useMemo(() => {
		if (!conversations) return 0;
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		return conversations.filter((c) => new Date(c.lastTimestamp) >= start)
			.length;
	}, [conversations]);

	const urgentCount =
		openTodos?.filter((t) => t.priority === "URGENT").length ?? 0;
	const highCount = openTodos?.filter((t) => t.priority === "HIGH").length ?? 0;
	const criticalCount = urgentCount + highCount;

	const openCount = openTodos?.length ?? 0;
	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const newThisWeek =
		openTodos?.filter((t) => new Date(t.createdAt) >= weekAgo).length ?? 0;

	const recentTodos =
		openTodos
			?.sort((a, b) => {
				const order = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
				return (
					(order[a.priority as keyof typeof order] ?? 2) -
					(order[b.priority as keyof typeof order] ?? 2)
				);
			})
			.slice(0, 4) ?? [];

	const recentConversations = conversations?.slice(0, 4) ?? [];

	const stats = [
		{
			label: "Active conversations",
			value: conversations ? String(conversations.length) : "—",
			sub:
				messagesToday > 0 ? `${messagesToday} new today` : "No activity today",
			accent: messagesToday > 0,
			icon: (
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
						strokeWidth={1.75}
						d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
					/>
				</svg>
			),
		},
		{
			label: "Open to-dos",
			value: openTodos ? String(openCount) : "—",
			sub:
				criticalCount > 0 ? `${criticalCount} urgent/high` : "All up to date",
			accent: criticalCount > 0,
			urgent: criticalCount > 0,
			icon: (
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
						strokeWidth={1.75}
						d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
					/>
				</svg>
			),
		},
		{
			label: "Connected sessions",
			value: sessions ? `${connectedSessions}/${totalSessions}` : "—",
			sub: hasSessionIssues
				? "Session error — check"
				: connectedSessions > 0
					? "All healthy"
					: "None connected",
			accent: !hasSessionIssues && connectedSessions > 0,
			urgent: hasSessionIssues,
			icon: (
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
						strokeWidth={1.75}
						d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
					/>
				</svg>
			),
		},
		{
			label: "AI tasks captured",
			value: openTodos ? String(newThisWeek) : "—",
			sub: "This week",
			accent: newThisWeek > 0,
			icon: (
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
						strokeWidth={1.75}
						d="M13 10V3L4 14h7v7l9-11h-7z"
					/>
				</svg>
			),
		},
	];

	return (
		<div className="p-8 max-w-6xl">
			{/* Header */}
			<div className="mb-8 flex items-start justify-between">
				<div>
					<p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
						Overview
					</p>
					<h1 className="text-2xl font-semibold text-zinc-950 tracking-tight">
						{org?.name ?? "Dashboard"}
					</h1>
					<p className="text-sm text-zinc-500 mt-1">
						{new Date().toLocaleDateString("en-US", {
							weekday: "long",
							month: "long",
							day: "numeric",
						})}
					</p>
				</div>
				{criticalCount > 0 && (
					<Link
						href="/dashboard/todos"
						className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 hover:bg-red-100 transition-colors"
					>
						<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
						<span className="text-[13px] font-semibold text-red-700">
							{criticalCount} urgent task{criticalCount !== 1 ? "s" : ""} need
							attention
						</span>
						<svg
							className="w-3.5 h-3.5 text-red-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</Link>
				)}
			</div>

			{/* Stats */}
			<div className="grid grid-cols-4 gap-4 mb-8">
				{stats.map((stat) => (
					<div
						key={stat.label}
						className={`bg-white border rounded-xl p-5 ${stat.urgent ? "border-red-200 bg-red-50/30" : "border-zinc-200"}`}
					>
						<div className="flex items-center justify-between mb-3">
							<p className="text-xs font-medium text-zinc-500">{stat.label}</p>
							<span className={stat.urgent ? "text-red-400" : "text-zinc-300"}>
								{stat.icon}
							</span>
						</div>
						<p
							className={`text-[2rem] font-bold leading-none mb-1.5 ${stat.urgent ? "text-red-700" : "text-zinc-950"}`}
						>
							{stat.value}
						</p>
						<p
							className={`text-xs font-medium ${stat.urgent ? "text-red-500" : stat.accent ? "text-emerald-600" : "text-zinc-400"}`}
						>
							{stat.sub}
						</p>
					</div>
				))}
			</div>

			<div className="grid grid-cols-2 gap-5 mb-5">
				{/* Recent To-Dos */}
				<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
					<div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
						<div>
							<h2 className="text-[13px] font-semibold text-zinc-900">
								Open tasks
							</h2>
							{openCount > 0 && (
								<p className="text-[11px] text-zinc-400 mt-0.5">
									Sorted by priority
								</p>
							)}
						</div>
						<Link
							href="/dashboard/todos"
							className="text-xs text-zinc-400 hover:text-zinc-700 font-medium transition-colors"
						>
							View all →
						</Link>
					</div>
					{!openTodos ? (
						<div className="p-5 space-y-2">
							{[0, 1, 2].map((i) => (
								<div
									key={i}
									className="h-10 bg-zinc-100 rounded-lg animate-pulse"
									style={{ opacity: 1 - i * 0.3 }}
								/>
							))}
						</div>
					) : recentTodos.length === 0 ? (
						<div className="px-5 py-10 text-center">
							<div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-2">
								<svg
									className="w-4 h-4 text-emerald-500"
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
							</div>
							<p className="text-sm text-zinc-500 font-medium">All clear</p>
							<p className="text-xs text-zinc-400 mt-0.5">No open tasks</p>
						</div>
					) : (
						<div className="divide-y divide-zinc-100">
							{recentTodos.map((todo) => {
								const cfg =
									priorityConfig[todo.priority] ?? priorityConfig.NORMAL;
								return (
									<div
										key={todo.id}
										className="px-5 py-3 flex items-start gap-3"
									>
										<div
											className={`w-1.5 h-1.5 rounded-full ${cfg.dot} mt-1.5 shrink-0`}
										/>
										<div className="flex-1 min-w-0">
											<p className="text-[13px] text-zinc-800 truncate leading-snug">
												{todo.title}
											</p>
											<p
												className={`text-[11px] mt-0.5 font-medium ${cfg.text}`}
											>
												{cfg.label} · {timeAgo(todo.createdAt)}
											</p>
										</div>
									</div>
								);
							})}
							{openCount > 4 && (
								<div className="px-5 py-2.5 bg-zinc-50">
									<Link
										href="/dashboard/todos"
										className="text-[12px] text-zinc-500 hover:text-zinc-800 font-medium transition-colors"
									>
										+ {openCount - 4} more tasks →
									</Link>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Recent Conversations */}
				<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
					<div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
						<div>
							<h2 className="text-[13px] font-semibold text-zinc-900">
								Recent conversations
							</h2>
							{(conversations?.length ?? 0) > 0 && (
								<p className="text-[11px] text-zinc-400 mt-0.5">
									{conversations?.length} total
								</p>
							)}
						</div>
						<Link
							href="/dashboard/messages"
							className="text-xs text-zinc-400 hover:text-zinc-700 font-medium transition-colors"
						>
							View all →
						</Link>
					</div>
					{!conversations ? (
						<div className="p-5 space-y-2">
							{[0, 1, 2].map((i) => (
								<div
									key={i}
									className="h-12 bg-zinc-100 rounded-lg animate-pulse"
									style={{ opacity: 1 - i * 0.3 }}
								/>
							))}
						</div>
					) : recentConversations.length === 0 ? (
						<div className="px-5 py-10 text-center">
							<div className="w-8 h-8 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-2">
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
										d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
									/>
								</svg>
							</div>
							<p className="text-sm text-zinc-500 font-medium">
								No messages yet
							</p>
							<p className="text-xs text-zinc-400 mt-0.5">
								Connect a WhatsApp session to get started
							</p>
						</div>
					) : (
						<div className="divide-y divide-zinc-100">
							{recentConversations.map((conv, i) => (
								<Link
									key={conv.contactPhone}
									href="/dashboard/messages"
									className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50 transition-colors"
								>
									<div
										className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[11px] font-bold shrink-0`}
									>
										{phoneInitials(conv.contactPhone)}
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-[13px] font-semibold text-zinc-900 leading-snug font-mono">
											{conv.contactPhone}
										</p>
										<p className="text-xs text-zinc-400 truncate mt-0.5">
											{conv.lastMessage}
										</p>
									</div>
									<span className="text-[11px] text-zinc-400 shrink-0">
										{timeAgo(conv.lastTimestamp)}
									</span>
								</Link>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Session health + AI banner row */}
			<div className="grid grid-cols-2 gap-5">
				{/* Session status */}
				<div
					className={`rounded-xl border p-5 ${hasSessionIssues ? "bg-red-50 border-red-200" : connectedSessions > 0 ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-200"}`}
				>
					<div className="flex items-start justify-between">
						<div>
							<div className="flex items-center gap-2 mb-1">
								<span
									className={`w-2 h-2 rounded-full ${hasSessionIssues ? "bg-red-500 animate-pulse" : connectedSessions > 0 ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`}
								/>
								<p
									className={`text-[13px] font-semibold ${hasSessionIssues ? "text-red-800" : connectedSessions > 0 ? "text-emerald-800" : "text-zinc-700"}`}
								>
									{hasSessionIssues
										? "Session error detected"
										: connectedSessions > 0
											? `${connectedSessions} session${connectedSessions !== 1 ? "s" : ""} live`
											: "No active sessions"}
								</p>
							</div>
							<p
								className={`text-xs ${hasSessionIssues ? "text-red-600" : connectedSessions > 0 ? "text-emerald-700" : "text-zinc-500"}`}
							>
								{hasSessionIssues
									? "Check sessions page for details"
									: connectedSessions > 0
										? "WhatsApp monitoring is active"
										: "Connect a session to start monitoring"}
							</p>
						</div>
						<Link
							href="/dashboard/sessions"
							className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${hasSessionIssues ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"}`}
						>
							Manage →
						</Link>
					</div>
				</div>

				{/* AI banner */}
				<div className="bg-zinc-950 rounded-xl p-5 flex items-center gap-4">
					<div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
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
								strokeWidth={1.75}
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-semibold text-white">
							{newThisWeek} task{newThisWeek !== 1 ? "s" : ""} captured this
							week
						</p>
						<p className="text-xs text-zinc-400 mt-0.5">
							Every customer message auto-detected by Claude AI
						</p>
					</div>
					<Link
						href="/dashboard/todos"
						className="px-4 py-2 bg-white text-zinc-950 text-xs font-semibold rounded-lg hover:bg-zinc-100 transition-colors shrink-0"
					>
						Review →
					</Link>
				</div>
			</div>
		</div>
	);
}
