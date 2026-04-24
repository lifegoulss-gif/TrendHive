import PusherClient from "pusher-js";

let instance: PusherClient | null = null;

export function getPusher(): PusherClient {
	if (typeof window === "undefined") {
		throw new Error("getPusher() must only be called in the browser");
	}
	if (!instance) {
		instance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
			cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
			authEndpoint: "/api/pusher/auth",
		});
	}
	return instance;
}
