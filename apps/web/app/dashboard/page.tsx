import { auth } from "@clerk/nextjs/server";
import { prisma } from "@repo/database";
import { redirect } from "next/navigation";
import DashboardTabs from "./DashboardTabs";

export default async function DashboardPage() {
	// Layout already redirects employees, but we guard here too so the page
	// never renders for an EMPLOYEE even if the layout check is bypassed.
	if (process.env.NODE_ENV !== "development") {
		try {
			const { userId } = await auth();
			if (userId) {
				const user = await prisma.user.findUnique({
					where: { clerkId: userId },
					select: { role: true },
				});
				if (user?.role === "EMPLOYEE") redirect("/dashboard/todos");
			}
		} catch {
			// Auth or DB unavailable — let the page render, layout guard covers it
		}
	}

	return (
		<div className="p-8 max-w-5xl">
			<div className="mb-8">
				<p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">
					Overview
				</p>
				<h1 className="text-2xl font-semibold text-zinc-950 tracking-tight">
					To-Do Oversight
				</h1>
				<p className="text-sm text-zinc-500 mt-1">
					{new Date().toLocaleDateString("en-US", {
						weekday: "long",
						month: "long",
						day: "numeric",
					})}
				</p>
			</div>
			<DashboardTabs />
		</div>
	);
}
