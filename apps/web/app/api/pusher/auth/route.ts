import { auth } from "@clerk/nextjs/server";
import { prisma } from "@repo/database";
import { type NextRequest, NextResponse } from "next/server";
import Pusher from "pusher";

const DEV_CLERK_ID = "dev_local_user";

const pusher = new Pusher({
	appId: process.env.PUSHER_APP_ID ?? "",
	key: process.env.PUSHER_KEY ?? "",
	secret: process.env.PUSHER_SECRET ?? "",
	cluster: process.env.PUSHER_CLUSTER ?? "",
	useTLS: true,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
	// Read body first (before any async auth call that might consume the stream)
	const body = await req.text();

	let clerkId: string | null = null;

	if (process.env.NODE_ENV === "development") {
		clerkId = DEV_CLERK_ID;
	} else {
		// Use auth() (App Router) not getAuth() (Pages Router)
		const { userId } = await auth();
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		clerkId = userId;
	}

	const user = await prisma.user.findUnique({
		where: { clerkId },
		select: { orgId: true },
	});
	if (!user) {
		return NextResponse.json({ error: "User not found" }, { status: 401 });
	}

	const params = new URLSearchParams(body);
	const socketId = params.get("socket_id");
	const channelName = params.get("channel_name");

	if (!socketId || !channelName) {
		return NextResponse.json(
			{ error: "Missing socket_id or channel_name" },
			{ status: 400 },
		);
	}

	// Private channels follow the pattern: private-{orgId}-{type}
	// orgId is a CUID (no hyphens), so split on first "-" to get it safely
	const withoutPrefix = channelName.replace("private-", "");
	const dashIdx = withoutPrefix.indexOf("-");
	const channelOrgId = dashIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, dashIdx);

	if (channelOrgId !== user.orgId) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const authResponse = pusher.authorizeChannel(socketId, channelName);
	return NextResponse.json(authResponse);
}
