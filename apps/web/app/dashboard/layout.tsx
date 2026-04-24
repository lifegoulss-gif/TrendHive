import { prisma } from "@repo/database";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "../components/Sidebar";

const EMPLOYEE_ALLOWED = ["/dashboard/todos", "/dashboard/messages"];

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// In production, enforce role-based route access server-side
	if (process.env.NODE_ENV !== "development") {
		try {
			const headersList = await headers();
			// x-pathname is set by middleware.ts on every request
			const pathname = headersList.get("x-pathname") ?? "";

			const { userId } = await auth();
			if (userId) {
				const user = await prisma.user.findFirst({
					where: { clerkId: userId },
					select: { role: true },
				});
				if (
					user?.role === "EMPLOYEE" &&
					!EMPLOYEE_ALLOWED.some((p) => pathname.startsWith(p))
				) {
					redirect("/dashboard/todos");
				}
			}
		} catch {
			// DB unreachable or Clerk error — skip role check, let page load
		}
	}

	return (
		<div className="flex h-screen bg-zinc-50">
			<Sidebar />
			<main className="flex-1 overflow-y-auto" style={{ marginLeft: "220px" }}>
				{children}
			</main>
		</div>
	);
}
