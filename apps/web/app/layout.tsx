import { TRPCProvider } from "@/trpc/client";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const dmSans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
	weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
	title: "UniboxAI — Unified WhatsApp for Teams",
	description: "Manage employee WhatsApp inboxes, extract todos with AI",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<ClerkProvider>
			<html lang="en" className={dmSans.variable}>
				<body style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
					<TRPCProvider>
						{children}
						<Toaster
							position="bottom-right"
							toastOptions={{
								style: {
									background: "#09090b",
									color: "#fafafa",
									fontSize: "13px",
									border: "1px solid #27272a",
									borderRadius: "10px",
								},
							}}
						/>
					</TRPCProvider>
				</body>
			</html>
		</ClerkProvider>
	);
}
