"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SetupWait() {
	const router = useRouter();

	useEffect(() => {
		const t = setTimeout(() => router.refresh(), 3000);
		return () => clearTimeout(t);
	}, [router]);

	return (
		<div className="min-h-screen flex items-center justify-center bg-white">
			<div className="text-center">
				<div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-950 rounded-full animate-spin mx-auto mb-4" />
				<p className="text-sm font-semibold text-zinc-700">
					Setting up your account…
				</p>
				<p className="text-xs text-zinc-400 mt-1">This only takes a moment</p>
			</div>
		</div>
	);
}
