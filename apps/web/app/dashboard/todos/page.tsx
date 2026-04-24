"use client";

import { usePusherChannel } from "@/hooks/usePusherChannel";
import { trpc } from "@/trpc/client";
import Link from "next/link";
import { useMemo, useState } from "react";

const priorityConfig: Record<
	string,
	{ dot: string; label: string; bg: string; text: string; border: string }
> = {
	URGENT: {
		dot: "bg-red-500",
		label: "Urgent",
		bg: "bg-red-50",
		text: "text-red-700",
		border: "border-red-200",
	},
	HIGH: {
		dot: "bg-orange-400",
		label: "High",
		bg: "bg-orange-50",
		text: "text-orange-700",
		border: "border-orange-200",
	},
	NORMAL: {
		dot: "bg-amber-400",
		label: "Normal",
		bg: "bg-zinc-50",
		text: "text-zinc-600",
		border: "border-zinc-200",
	},
	LOW: {
		dot: "bg-zinc-300",
		label: "Low",
		bg: "bg-zinc-50",
		text: "text-zinc-400",
		border: "border-zinc-200",
	},
};

const priorityOrder: Record<string, number> = {
	URGENT: 4,
	HIGH: 3,
	NORMAL: 2,
	LOW: 1,
};

function timeAgo(date: Date | string) {
	const d = new Date(date);
	const diff = Math.floor((Date.now() - d.getTime()) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDue(date: Date | string | null) {
	if (!date) return null;
	const d = new Date(date);
	const diff = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
	if (diff < 0) return { label: "Overdue", urgent: true };
	if (diff === 0) return { label: "Due today", urgent: true };
	if (diff === 1) return { label: "Due tomorrow", urgent: false };
	return {
		label: `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
		urgent: false,
	};
}

// Strip priority prefix and phone suffix/prefix to get a short topic label
function extractTopic(title: string): string {
	let t = title.replace(/^\[(Spam|Possible Spam)\]\s*/i, "");
	t = t.replace(/^(Urgent|High|Normal|Low):\s*/i, "");
	t = t.replace(/\s*→\s*\+\d{7,15}/, "");
	t = t.replace(/^\+\d{7,15}:\s*/, "");
	return t.trim() || title;
}

// Customer phone: INBOUND = from is customer, OUTBOUND = to is customer
function getCustomerPhone(todo: {
	message: { from: string; to: string; direction: string } | null;
}): string {
	if (!todo.message) return "unknown";
	return todo.message.direction === "INBOUND"
		? todo.message.from
		: todo.message.to;
}

export default function TodosPage() {
	const [filter, setFilter] = useState<
		"all" | "URGENT" | "HIGH" | "NORMAL" | "LOW"
	>("all");

	const {
		data: openTodos,
		isLoading,
		refetch,
	} = trpc.todo.list.useQuery({ completed: false }, { staleTime: 10_000 });
	const { data: doneTodos, refetch: refetchDone } = trpc.todo.list.useQuery(
		{ completed: true },
		{ staleTime: 30_000 },
	);
	const { data: org } = trpc.org.getCurrent.useQuery(undefined, {
		staleTime: 60_000,
	});

	const completeMutation = trpc.todo.complete.useMutation({
		onSuccess: () => {
			refetch();
			refetchDone();
		},
	});

	usePusherChannel<{ todoId: string }>(
		org?.id ? `private-${org.id}-todos` : null,
		"todo.new",
		() => refetch(),
	);
	usePusherChannel<{ todoId: string }>(
		org?.id ? `private-${org.id}-todos` : null,
		"todo.updated",
		() => refetch(),
	);
	usePusherChannel<{ todoId: string }>(
		org?.id ? `private-${org.id}-todos` : null,
		"todo.deleted",
		() => refetch(),
	);

	const filtered =
		filter === "all"
			? openTodos
			: openTodos?.filter((t) => t.priority === filter);

	// Group filtered todos by customer phone number
	const grouped = useMemo(() => {
		if (!filtered) return [];
		const map = new Map<string, typeof filtered>();
		for (const todo of filtered) {
			const phone = getCustomerPhone(todo);
			if (!map.has(phone)) map.set(phone, []);
			map.get(phone)!.push(todo);
		}
		// Sort groups: highest-priority group first
		return Array.from(map.entries()).sort(([, a], [, b]) => {
			const maxA = Math.max(...a.map((t) => priorityOrder[t.priority] ?? 0));
			const maxB = Math.max(...b.map((t) => priorityOrder[t.priority] ?? 0));
			return maxB - maxA;
		});
	}, [filtered]);

	const urgentCount =
		openTodos?.filter((t) => t.priority === "URGENT").length ?? 0;
	const highCount = openTodos?.filter((t) => t.priority === "HIGH").length ?? 0;

	// Count unique customers with urgent/high tasks
	const urgentCustomers = useMemo(() => {
		if (!openTodos) return 0;
		const phones = new Set(
			openTodos
				.filter((t) => t.priority === "URGENT" || t.priority === "HIGH")
				.map(getCustomerPhone),
		);
		return phones.size;
	}, [openTodos]);

	return (
		<div className="p-8 max-w-3xl">
			{/* Header */}
			<div className="mb-8 flex items-start justify-between">
				<div>
					<p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
						To-Dos
					</p>
					<h1 className="text-2xl font-semibold text-zinc-950 tracking-tight">
						Customer Tasks
					</h1>
					<p className="text-sm text-zinc-500 mt-1">
						Every customer message — auto-captured, AI-enriched
					</p>
				</div>
				{urgentCount + highCount > 0 && (
					<div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
						<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
						<span className="text-[13px] font-semibold text-red-700">
							{urgentCustomers} customer{urgentCustomers > 1 ? "s" : ""} urgent/high
						</span>
					</div>
				)}
			</div>

			{/* Priority filter tabs */}
			<div className="flex items-center gap-1 mb-6 bg-zinc-100 rounded-xl p-1 w-fit">
				{(["all", "URGENT", "HIGH", "NORMAL", "LOW"] as const).map((f) => {
					const count =
						f === "all"
							? (openTodos?.length ?? 0)
							: (openTodos?.filter((t) => t.priority === f).length ?? 0);
					return (
						<button
							type="button"
							key={f}
							onClick={() => setFilter(f)}
							className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
								filter === f
									? "bg-white text-zinc-900 shadow-sm"
									: "text-zinc-500 hover:text-zinc-700"
							}`}
						>
							{f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
							<span
								className={`ml-1.5 text-[11px] ${filter === f ? "text-zinc-500" : "text-zinc-400"}`}
							>
								{count}
							</span>
						</button>
					);
				})}
			</div>

			{isLoading ? (
				<div className="space-y-2">
					{[0, 1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-[80px] bg-zinc-100 rounded-xl animate-pulse"
							style={{ opacity: 1 - i * 0.2 }}
						/>
					))}
				</div>
			) : (
				<div className="space-y-8">
					{/* Open todos — grouped by customer */}
					<section>
						{grouped.length === 0 ? (
							<div className="border border-dashed border-zinc-200 rounded-xl px-5 py-12 text-center">
								<svg
									className="w-6 h-6 text-zinc-300 mx-auto mb-2"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<p className="text-sm text-zinc-400">All clear — no open tasks</p>
							</div>
						) : (
							<div className="space-y-3">
								{grouped.map(([customerPhone, todos]) => {
									const topPriority = todos.reduce(
										(max, t) =>
											(priorityOrder[t.priority] ?? 0) > (priorityOrder[max] ?? 0)
												? t.priority
												: max,
										todos[0].priority,
									);
									const cfg =
										priorityConfig[topPriority] ?? priorityConfig.NORMAL;
									const isUrgentGroup = topPriority === "URGENT";

									return (
										<div
											key={customerPhone}
											className={`bg-white border rounded-xl overflow-hidden transition-colors ${
												isUrgentGroup
													? "border-red-200"
													: "border-zinc-200 hover:border-zinc-300"
											}`}
										>
											{/* Customer header */}
											<div
												className={`flex items-center justify-between px-4 py-2.5 border-b ${
													isUrgentGroup
														? "border-red-100 bg-red-50/40"
														: "border-zinc-100 bg-zinc-50/60"
												}`}
											>
												<div className="flex items-center gap-2.5">
													<Link
														href="/dashboard/messages"
														className="text-[13px] font-mono font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition-colors"
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
																strokeWidth={2}
																d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
															/>
														</svg>
														{customerPhone}
													</Link>
													<span className="text-[11px] text-zinc-400 font-medium bg-white border border-zinc-200 px-1.5 py-0.5 rounded-md">
														{todos.length} task{todos.length > 1 ? "s" : ""}
													</span>
												</div>
												<span
													className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border} flex items-center gap-1.5`}
												>
													<span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
													{cfg.label}
												</span>
											</div>

											{/* Individual tasks within the group */}
											<div className="divide-y divide-zinc-50">
												{todos.map((todo) => {
													const topic = extractTopic(todo.title);
													const due = formatDue(todo.dueDate);
													const todoCfg =
														priorityConfig[todo.priority] ?? priorityConfig.NORMAL;
													const isSpam =
														todo.title.startsWith("[Spam]") ||
														todo.title.startsWith("[Possible Spam]");
													const sessionLabel =
														todo.message?.session?.name ??
														todo.message?.session?.phoneNumber ??
														null;

													return (
														<div
															key={todo.id}
															className="flex items-center gap-3 px-4 py-3"
														>
															<button
																type="button"
																onClick={() =>
																	completeMutation.mutate(todo.id)
																}
																disabled={completeMutation.isPending}
																className="w-[16px] h-[16px] rounded-[4px] border-2 border-zinc-300 shrink-0 hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-40"
																aria-label="Mark as done"
															/>
															<div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
																{/* AI topic tag */}
																<span
																	className={`text-[12px] font-medium px-2 py-0.5 rounded-md ${
																		isSpam
																			? "bg-zinc-100 text-zinc-400 italic"
																			: "bg-zinc-100 text-zinc-800"
																	}`}
																>
																	{topic}
																</span>
																{due && (
																	<span
																		className={`text-[11px] flex items-center gap-0.5 font-medium ${due.urgent ? "text-red-500" : "text-zinc-400"}`}
																	>
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
																		{due.label}
																	</span>
																)}
																{sessionLabel && (
																	<span className="text-[11px] text-zinc-400 flex items-center gap-1">
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
																				d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
																			/>
																		</svg>
																		{sessionLabel}
																	</span>
																)}
																<span className="text-[11px] text-zinc-300">
																	{timeAgo(todo.createdAt)}
																</span>
															</div>
															{/* Per-task priority (only show if different from group top priority) */}
															{todo.priority !== topPriority && (
																<span
																	className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${todoCfg.bg} ${todoCfg.text} ${todoCfg.border}`}
																>
																	{todoCfg.label}
																</span>
															)}
														</div>
													);
												})}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</section>

					{/* Completed */}
					{(doneTodos?.length ?? 0) > 0 && (
						<section>
							<div className="flex items-center gap-2 mb-3">
								<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
									Completed
								</h2>
								<span className="text-xs text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md font-medium">
									{doneTodos?.length}
								</span>
							</div>
							<div className="space-y-1">
								{doneTodos?.slice(0, 10).map((todo) => (
									<div
										key={todo.id}
										className="border border-zinc-100 rounded-xl px-4 py-3 flex items-center gap-3 opacity-50"
									>
										<div className="w-[16px] h-[16px] rounded-[4px] bg-emerald-500 border-2 border-emerald-500 shrink-0 flex items-center justify-center">
											<svg
												className="w-2.5 h-2.5 text-white"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												aria-hidden="true"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={3}
													d="M5 13l4 4L19 7"
												/>
											</svg>
										</div>
										<span className="text-[11px] font-mono text-zinc-400 font-semibold">
											{getCustomerPhone(todo)}
										</span>
										<p className="text-[13px] text-zinc-400 line-through truncate">
											{extractTopic(todo.title)}
										</p>
									</div>
								))}
							</div>
						</section>
					)}
				</div>
			)}
		</div>
	);
}
