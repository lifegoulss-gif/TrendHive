import { Queue } from "bullmq";

export interface SendMessageJob {
	type: "send_message";
	sessionId: string;
	to: string;
	text: string;
	orgId: string;
}

function getRedisConnection() {
	const url =
		process.env.UPSTASH_URL ??
		process.env.REDIS_URL ??
		"redis://localhost:6379";
	const parsed = new URL(url);
	return {
		host: parsed.hostname,
		port: parsed.port ? Number(parsed.port) : 6379,
		...(parsed.password
			? { password: decodeURIComponent(parsed.password) }
			: {}),
		...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
	};
}

let _queue: Queue | null = null;

function getQueue(): Queue {
	if (!_queue) {
		_queue = new Queue("messages", { connection: getRedisConnection() });
	}
	return _queue;
}

export async function enqueueMessageJob(data: SendMessageJob): Promise<void> {
	await getQueue().add(data.type, data, {
		removeOnComplete: true,
		removeOnFail: false,
		attempts: 3,
		backoff: { type: "exponential", delay: 2000 },
	});
}
