"use client";

import { trpc } from "@/trpc/client";
import { useState } from "react";

type Status = "missed" | "completed";

const priorityConfig = {
	URGENT: {
		label: "Urgent",
		bg: "bg-red-50",
		text: "text-red-700",
		dot: "bg-red-500",
		border: "border-red-200",
	},
	HIGH: {
		label: "High",
		bg: "bg-orange-50",
		text: "text-orange-700",
		dot: "bg-orange-400",
		border: "border-orange-200",
	},
	NORMAL: {
		label: "Normal",
		bg: "bg-amber-50",
		text: "text-amber-700",
		dot: "bg-amber-400",
		border: "border-amber-200",
	},
	LOW: {
		label: "Low",
		bg: "bg-zinc-50",
		text: "text-zinc-500",
		dot: "bg-zinc-300",
		border: "border-zinc-200",
	},
} as const;

type TodoItem = {
	id: string;
	title: string;
	priority: string;
	dueDate: Date | string | null;
	completedAt: Date | string | null;
	message: {
		session: {
			name: string | null;
			phoneNumber: string | null;
			user: { id: string; name: string | null; email: string } | null;
		};
	};
};

function employeeLabel(item: TodoItem): string {
	const user = item.message.session.user;
	if (user) return user.name ?? user.email;
	return (
		item.message.session.name ??
		item.message.session.phoneNumber ??
		"Unknown employee"
	);
}

function daysOverdue(dueDate: Date | string): string {
	const diff = Math.floor(
		(Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
	);
	if (diff < 1) return "Due today";
	if (diff === 1) return "1 day overdue";
	return `${diff} days overdue`;
}

function shortDate(date: Date | string | null): string {
	if (!date) return "—";
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function PriorityBadge({ priority }: { priority: string }) {
	const cfg =
		priorityConfig[priority as keyof typeof priorityConfig] ??
		priorityConfig.NORMAL;
	return (
		<span
			className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
		>
			<span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
			{cfg.label}
		</span>
	);
}

function TodoRow({ item, status }: { item: TodoItem; status: Status }) {
	const employee = employeeLabel(item);
	const initial = employee.charAt(0).toUpperCase();

	return (
		<div className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50/60 transition-colors">
			<div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0">
				{initial}
			</div>

			<div className="flex-1 min-w-0">
				<p className="text-[13px] text-zinc-800 truncate font-medium">
					{item.title}
				</p>
				<p className="text-[11px] text-zinc-400 mt-0.5">{employee}</p>
			</div>

			<PriorityBadge priority={item.priority} />

			<div className="text-right shrink-0 min-w-[120px]">
				{status === "missed" && item.dueDate != null ? (
					<span className="text-[12px] font-semibold text-red-500">
						{daysOverdue(item.dueDate)}
					</span>
				) : status === "completed" ? (
					<span className="text-[12px] text-zinc-400">
						Done {shortDate(item.completedAt)}
					</span>
				) : null}
			</div>
		</div>
	);
}

function EmptyState({ status }: { status: Status }) {
	if (status === "missed") {
		return (
			<div className="py-16 text-center">
				<div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-3">
					<svg
						className="w-5 h-5 text-emerald-500"
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
				<p className="text-sm font-semibold text-zinc-700">No missed to-dos</p>
				<p className="text-xs text-zinc-400 mt-1">
					Your team is on top of everything
				</p>
			</div>
		);
	}
	return (
		<div className="py-16 text-center">
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
						d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
					/>
				</svg>
			</div>
			<p className="text-sm font-semibold text-zinc-700">No completed to-dos</p>
			<p className="text-xs text-zinc-400 mt-1">
				Completed tasks will appear here
			</p>
		</div>
	);
}

function SkeletonRows() {
	return (
		<div className="p-5 space-y-2">
			{[0, 1, 2, 3].map((i) => (
				<div
					key={i}
					className="h-12 bg-zinc-100 rounded-lg animate-pulse"
					style={{ opacity: 1 - i * 0.2 }}
				/>
			))}
		</div>
	);
}

export default function DashboardTabs() {
	const [status, setStatus] = useState<Status>("missed");

	const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
		trpc.todo.listForDashboard.useInfiniteQuery(
			{ status, limit: 50 },
			{
				getNextPageParam: (lastPage) => lastPage.nextCursor,
				staleTime: 15_000,
			},
		);

	const items = data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<div>
			{/* Tab switcher */}
			<div className="flex items-center gap-1 mb-6 bg-zinc-100 rounded-xl p-1 w-fit">
				{(["missed", "completed"] as const).map((tab) => (
					<button
						key={tab}
						type="button"
						onClick={() => setStatus(tab)}
						className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
							status === tab
								? "bg-white text-zinc-900 shadow-sm"
								: "text-zinc-500 hover:text-zinc-700"
						}`}
					>
						{tab.charAt(0).toUpperCase() + tab.slice(1)}
					</button>
				))}
			</div>

			{/* Table */}
			<div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
				{/* Column headers */}
				<div className="flex items-center gap-4 px-5 py-2.5 border-b border-zinc-100 bg-zinc-50/80">
					<div className="w-7 shrink-0" />
					<p className="flex-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
						To-Do / Employee
					</p>
					<p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
						Priority
					</p>
					<p className="text-right text-[11px] font-semibold text-zinc-400 uppercase tracking-wide min-w-[120px]">
						{status === "missed" ? "Overdue" : "Completed on"}
					</p>
				</div>

				{isLoading ? (
					<SkeletonRows />
				) : items.length === 0 ? (
					<EmptyState status={status} />
				) : (
					<div className="divide-y divide-zinc-50">
						{items.map((item) => (
							<TodoRow key={item.id} item={item} status={status} />
						))}
					</div>
				)}

				{hasNextPage && (
					<div className="border-t border-zinc-100 px-5 py-3">
						<button
							type="button"
							onClick={() => fetchNextPage()}
							disabled={isFetchingNextPage}
							className="text-[12px] text-zinc-500 hover:text-zinc-800 font-medium transition-colors disabled:opacity-50"
						>
							{isFetchingNextPage ? "Loading…" : "Load more"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
