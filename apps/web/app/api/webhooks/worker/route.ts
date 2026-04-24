import crypto from "node:crypto";
import { prisma } from "@repo/database";
import { type NextRequest, NextResponse } from "next/server";
import Pusher from "pusher";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
	? new Resend(process.env.RESEND_API_KEY)
	: null;

const SECRET = process.env.WORKER_WEBHOOK_SECRET ?? "";

const pusher = new Pusher({
	appId: process.env.PUSHER_APP_ID ?? "",
	key: process.env.PUSHER_KEY ?? "",
	secret: process.env.PUSHER_SECRET ?? "",
	cluster: process.env.PUSHER_CLUSTER ?? "",
	useTLS: true,
});

function verifySignature(body: string, sig: string): boolean {
	if (!SECRET) return false;
	const expected = crypto
		.createHmac("sha256", SECRET)
		.update(body)
		.digest("hex");
	return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
	const raw = await req.text();
	const sig = req.headers.get("x-worker-signature") ?? "";

	if (!verifySignature(raw, sig)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: { event: string; payload: Record<string, unknown> };
	try {
		body = JSON.parse(raw);
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { event, payload } = body;

	try {
		switch (event) {
			case "session.qr": {
				const { sessionId, orgId, qr } = payload as {
					sessionId: string;
					orgId: string;
					qr: string;
				};
				// Store QR in DB so the browser can poll for it (Pusher is best-effort)
				await prisma.whatsAppSession.update({
					where: { id: sessionId },
					data: { pendingQr: qr as string },
				});
				await pusher
					.trigger(`private-${orgId}-sessions`, "session.qr", { sessionId, qr })
					.catch(() => {});
				break;
			}

			case "session.connected": {
				const { sessionId, orgId, phoneNumber } = payload as {
					sessionId: string;
					orgId: string;
					phoneNumber: string;
				};
				await prisma.whatsAppSession.update({
					where: { id: sessionId },
					data: {
						status: "CONNECTED",
						phoneNumber,
						lastConnectedAt: new Date(),
						pendingQr: null,
					},
				});
				await pusher
					.trigger(`private-${orgId}-sessions`, "session.connected", {
						sessionId,
						phoneNumber,
					})
					.catch(() => {});
				break;
			}

			case "session.disconnected": {
				const { sessionId, orgId } = payload as {
					sessionId: string;
					orgId: string;
				};
				await prisma.whatsAppSession.update({
					where: { id: sessionId },
					data: { status: "DISCONNECTED", pendingQr: null },
				});
				await pusher
					.trigger(`private-${orgId}-sessions`, "session.disconnected", {
						sessionId,
					})
					.catch(() => {});
				break;
			}

			case "session.error": {
				const { sessionId, orgId } = payload as {
					sessionId: string;
					orgId: string;
				};
				await prisma.whatsAppSession.update({
					where: { id: sessionId },
					data: {
						status: "ERROR",
						errorMessage: "Authentication failure — number may be banned",
						pendingQr: null,
					},
				});
				await pusher
					.trigger(`private-${orgId}-sessions`, "session.error", { sessionId })
					.catch(() => {});
				break;
			}

			case "cron.todo_alerts": {
				if (!resend) break;
				const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago
				const orgs = await prisma.organization.findMany({
					select: { id: true, name: true },
				});
				for (const org of orgs) {
					const overdue = await prisma.todo.findMany({
						where: {
							orgId: org.id,
							completed: false,
							createdAt: { lt: cutoff },
						},
						select: { title: true, priority: true, createdAt: true },
						orderBy: [{ priority: "desc" }],
					});
					if (!overdue.length) continue;
					const admin = await prisma.user.findFirst({
						where: { orgId: org.id, role: "OWNER" },
						select: { email: true },
					});
					if (!admin?.email) continue;
					const list = overdue
						.map((t) => `• [${t.priority}] ${t.title}`)
						.join("\n");
					await resend.emails.send({
						from: "UniboxAI <alerts@yourdomain.com>",
						to: admin.email,
						subject: `⚠️ ${overdue.length} incomplete task${overdue.length > 1 ? "s" : ""} — ${org.name}`,
						text: `Hi,\n\nThese tasks are overdue and need attention:\n\n${list}\n\nLog in to mark them complete: ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002"}/dashboard/todos\n\n— UniboxAI`,
					});
					console.log(
						`[Webhook] Sent overdue alert to ${admin.email}: ${overdue.length} todos`,
					);
				}
				break;
			}

			default:
				console.warn(`[Worker Webhook] Unknown event: ${event}`);
		}
	} catch (err) {
		console.error(`[Worker Webhook] Error handling ${event}:`, err);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}
