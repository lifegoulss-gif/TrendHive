"use client";

import { getPusher } from "@/lib/pusher-client";
import { useEffect, useRef } from "react";

/**
 * Subscribes to a Pusher private channel and binds an event handler.
 * Uses a ref so the handler can close over the latest state without
 * causing the effect to re-run on every render.
 */
export function usePusherChannel<T = unknown>(
	channelName: string | null | undefined,
	eventName: string,
	handler: (data: T) => void,
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		if (!channelName) return;
		const pusher = getPusher();
		const channel = pusher.subscribe(channelName);
		const stableHandler = (data: T) => handlerRef.current(data);
		channel.bind(eventName, stableHandler);
		return () => {
			channel.unbind(eventName, stableHandler);
		};
	}, [channelName, eventName]);
}
