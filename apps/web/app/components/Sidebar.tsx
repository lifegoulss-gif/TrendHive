"use client";

import { trpc } from "@/trpc/client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavItem = {
	label: string;
	href: string;
	icon: React.ReactNode;
};

const overviewIcon = (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
	</svg>
);
const messagesIcon = (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
	</svg>
);
const todosIcon = (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
	</svg>
);
const teamIcon = (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
	</svg>
);
const sessionsIcon = (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
	</svg>
);
const settingsIcon = (
	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
	</svg>
);

const ownerManagerNav: NavItem[] = [
	{ label: "Overview", href: "/dashboard", icon: overviewIcon },
	{ label: "Messages", href: "/dashboard/messages", icon: messagesIcon },
	{ label: "To-Dos", href: "/dashboard/todos", icon: todosIcon },
	{ label: "Team", href: "/dashboard/team", icon: teamIcon },
	{ label: "Sessions", href: "/dashboard/sessions", icon: sessionsIcon },
];

const employeeNav: NavItem[] = [
	{ label: "My Tasks", href: "/dashboard/todos", icon: todosIcon },
	{ label: "Messages", href: "/dashboard/messages", icon: messagesIcon },
];

const ownerManagerBottom: NavItem[] = [
	{ label: "Settings", href: "/dashboard/settings", icon: settingsIcon },
];

function roleBadge(role: string) {
	if (role === "OWNER")
		return (
			<span className="text-[9px] font-bold px-1.5 py-0.5 bg-white/10 text-white/60 rounded-md uppercase tracking-wider">
				Owner
			</span>
		);
	if (role === "MANAGER")
		return (
			<span className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-md uppercase tracking-wider">
				Manager
			</span>
		);
	return (
		<span className="text-[9px] font-bold px-1.5 py-0.5 bg-white/5 text-white/40 rounded-md uppercase tracking-wider">
			Employee
		</span>
	);
}

function DevRoleToggle({ currentRole }: { currentRole: string }) {
	const router = useRouter();
	const utils = trpc.useUtils();

	function switchTo(role: "OWNER" | "EMPLOYEE") {
		document.cookie = `dev_role=${role}; path=/`;
		utils.invalidate();
		router.refresh();
	}

	return (
		<div className="mx-2.5 mb-2 p-2 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5">
			<p className="text-[9px] font-bold text-amber-400/70 uppercase tracking-wider mb-1.5">Dev — view as</p>
			<div className="flex gap-1">
				{(["OWNER", "EMPLOYEE"] as const).map((r) => (
					<button
						key={r}
						type="button"
						onClick={() => switchTo(r)}
						className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all ${
							currentRole === r
								? "bg-amber-400 text-zinc-900"
								: "text-amber-400/50 hover:text-amber-400"
						}`}
					>
						{r === "OWNER" ? "Owner" : "Employee"}
					</button>
				))}
			</div>
		</div>
	);
}

export default function Sidebar() {
	const pathname = usePathname();
	const { data: me } = trpc.org.me.useQuery(undefined, { staleTime: 60_000 });

	const isEmployee = me?.role === "EMPLOYEE";
	const navItems = isEmployee ? employeeNav : ownerManagerNav;
	const bottomItems = isEmployee ? [] : ownerManagerBottom;

	const initials = me?.name
		? me.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
		: me?.email?.charAt(0).toUpperCase() ?? "?";

	function isActive(href: string) {
		return href === "/dashboard"
			? pathname === "/dashboard"
			: pathname === href || pathname.startsWith(`${href}/`);
	}

	return (
		<aside
			className="flex flex-col w-[220px] h-screen fixed left-0 top-0"
			style={{ background: "#111113" }}
		>
			{/* Logo */}
			<div
				className="flex items-center gap-2.5 px-5 py-5 border-b"
				style={{ borderColor: "rgba(255,255,255,0.06)" }}
			>
				<div className="w-6 h-6 bg-white rounded-md flex items-center justify-center shrink-0">
					<svg
						className="w-3 h-3 text-zinc-950"
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
				<span className="text-sm font-semibold text-white tracking-tight">
					UniboxAI
				</span>
			</div>

			{/* Main nav */}
			<nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
				{navItems.map((item) => {
					const active = isActive(item.href);
					return (
						<Link
							key={item.href}
							href={item.href}
							className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
								active ? "text-white" : "text-zinc-500 hover:text-zinc-200"
							}`}
							style={active ? { background: "rgba(255,255,255,0.08)" } : undefined}
						>
							<span className={active ? "text-white" : "text-zinc-500"}>
								{item.icon}
							</span>
							{item.label}
						</Link>
					);
				})}
			</nav>

			{/* Bottom section */}
			<div
				className="px-3 pb-2 border-t"
				style={{ borderColor: "rgba(255,255,255,0.06)" }}
			>
				{bottomItems.length > 0 && (
					<div className="pt-2 space-y-0.5 mb-1">
						{bottomItems.map((item) => {
							const active = isActive(item.href);
							return (
								<Link
									key={item.href}
									href={item.href}
									className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
										active ? "text-white" : "text-zinc-500 hover:text-zinc-200"
									}`}
									style={active ? { background: "rgba(255,255,255,0.08)" } : undefined}
								>
									<span className={active ? "text-white" : "text-zinc-500"}>
										{item.icon}
									</span>
									{item.label}
								</Link>
							);
						})}
					</div>
				)}

				{/* Dev-only role switcher */}
				{process.env.NODE_ENV === "development" && me?.role && (
					<DevRoleToggle currentRole={me.role} />
				)}

				{/* User identity */}
				<div className="flex items-center gap-2.5 px-2.5 py-3 mt-1">
					<div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
						{initials}
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-[12px] text-zinc-300 font-medium truncate leading-tight">
							{me?.name ?? me?.email ?? "…"}
						</p>
						{me?.role && (
							<div className="mt-0.5">{roleBadge(me.role)}</div>
						)}
					</div>
				</div>
			</div>
		</aside>
	);
}
