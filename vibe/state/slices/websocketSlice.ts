// /Users/adimov/Developer/final/vibe/state/slices/websocketSlice.ts
// No changes needed - Client logic correctly prioritizes session token.
import { getAuthTokens } from "@/utils/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Draft } from "immer"; // Import Draft type for casting
import type { StateCreator } from "zustand";
import {
	type StoreState,
	WS_URL,
	type WebSocketMessage,
	type WebSocketSlice,
} from "../types";

const MAX_WS_MESSAGES = 50;
const CONNECTION_TIMEOUT_MS = 15000;
const WEBSOCKET_SUBSCRIPTIONS_KEY = "websocket_subscriptions";

// Define the WebSocketActions interface separately first
interface WebSocketActions {
	calculateBackoff: () => number;
	connectWebSocket: () => Promise<void>;
	disconnectWebSocket: (code?: number, reason?: string) => void;
	subscribeToConversation: (conversationId: string) => Promise<void>;
	unsubscribeFromConversation: (conversationId: string) => Promise<void>;
	clearMessages: () => void;
	getConversationResultError: (conversationId: string) => string | null;
	// Add internal action to handle subscription restoration
	_restoreSubscriptions: () => Promise<void>;
}

// Keep the StateCreator signature simple, assuming middleware is external
export const createWebSocketSlice: StateCreator<
	StoreState,
	[],
	[],
	WebSocketSlice
> = (setUntyped, get) => {
	// --- Explicitly cast `set` to the Immer-wrapped signature ---
	// This tells TypeScript how `set` behaves *after* Immer has wrapped it.
	const set = setUntyped as (fn: (draft: Draft<StoreState>) => void) => void;
	// --- End of cast ---

	const initialState: Omit<WebSocketSlice, keyof WebSocketActions> = {
		socket: null,
		wsMessages: [],
		conversationResults: {},
		reconnectAttempts: 0,
		maxReconnectAttempts: 5,
		reconnectInterval: 1000,
		maxReconnectDelay: 30000,
		isConnecting: false,
		connectionPromise: null,
		isAuthenticated: false, // New state: Track WS authentication status
	};

	// Define actions
	const actions: WebSocketActions = {
		getConversationResultError: (conversationId: string): string | null => {
			return get().conversationResults[conversationId]?.error || null;
		},

		calculateBackoff: () => {
			const state = get();
			const exponentialDelay = Math.min(
				2 ** state.reconnectAttempts * state.reconnectInterval,
				state.maxReconnectDelay,
			);
			const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
			return Math.max(
				state.reconnectInterval,
				Math.floor(exponentialDelay + jitter),
			);
		},

		disconnectWebSocket: (
			code = 1000,
			reason = "Client initiated disconnect",
		) => {
			const ws = get().socket;
			console.log(
				`[WS Client] disconnectWebSocket: Closing connection (Code: ${code}, Reason: ${reason})`,
			);
			if (
				ws &&
				ws.readyState !== WebSocket.CLOSING &&
				ws.readyState !== WebSocket.CLOSED
			) {
				ws.onopen = null;
				ws.onmessage = null;
				ws.onerror = null;
				ws.onclose = null;
				ws.close(code, reason);
			}
			// Use the correctly typed Immer `set`
			set((state) => {
				// state is now correctly inferred as Draft<StoreState>
				state.socket = null;
				state.isConnecting = false;
				state.reconnectAttempts = 0;
				state.connectionPromise = null;
				state.isAuthenticated = false; // Reset auth status on disconnect
			});
		},

		_restoreSubscriptions: async (): Promise<void> => {
			try {
				const storedTopics = await AsyncStorage.getItem(
					WEBSOCKET_SUBSCRIPTIONS_KEY,
				);
				if (storedTopics) {
					const topics = JSON.parse(storedTopics) as string[];
					console.log(
						`[WS Client] Restoring ${topics.length} subscriptions after successful auth...`,
					);
					for (const topic of topics) {
						const conversationId = topic.startsWith("conversation:")
							? topic.split(":")[1]
							: null;
						if (conversationId) {
							// Call subscribe, which will now send if authenticated
							actions.subscribeToConversation(conversationId);
						} else {
							console.warn(
								`[WS Client] Skipping restoration of invalid topic: ${topic}`,
							);
						}
					}
				}
			} catch (e: unknown) {
				console.error(
					"[WS Client] Error restoring subscriptions:",
					e instanceof Error ? e.message : e,
				);
			}
		},

		connectWebSocket: async (): Promise<void> => {
			const currentPromise = get().connectionPromise;
			if (currentPromise) {
				console.log(
					"[WS Client] connectWebSocket: Connection attempt already in progress.",
				);
				await currentPromise;
				return;
			}

			let resolveConnectionPromise: () => void;
			const newConnectionPromise = new Promise<void>((resolve) => {
				resolveConnectionPromise = resolve;
			});

			set((state) => {
				state.connectionPromise = newConnectionPromise;
				state.isAuthenticated = false; // Reset auth on new connection attempt
			});

			const connectLogic = async () => {
				console.log("[WS Client] connectWebSocket: Starting connection logic.");
				set((state) => {
					state.isConnecting = true;
				});

				const currentSocket = get().socket;
				if (
					currentSocket &&
					currentSocket.readyState === WebSocket.OPEN &&
					get().isAuthenticated
				) {
					console.log(
						"[WS Client] connectWebSocket: Already connected and authenticated.",
					);
					set((state) => {
						state.isConnecting = false;
					});
					resolveConnectionPromise();
					return;
				}

				if (currentSocket && currentSocket.readyState !== WebSocket.CLOSED) {
					console.log(
						"[WS Client] connectWebSocket: Closing existing socket before reconnecting.",
					);
					currentSocket.onclose = null;
					currentSocket.close(1000, "Client initiated reconnect");
					set((state) => {
						state.socket = null;
					});
					await new Promise((resolve) => setTimeout(resolve, 50));
				}

				try {
					const tokens = await getAuthTokens();
					const token = tokens.sessionToken || tokens.identityToken; // Correctly prefers session token

					if (!token) {
						console.error(
							"[WS Client] connectWebSocket: No session or identity token found. Cannot authenticate.",
						);
						set((state) => {
							state.isConnecting = false;
							state.connectionPromise = null;
						});
						resolveConnectionPromise();
						return;
					}
					const tokenType = tokens.sessionToken ? "session" : "identity";
					console.log(`[WS Client] connectWebSocket: Using ${tokenType} token`);

					const connectionUrl = WS_URL;
					console.log(
						"[WS Client] connectWebSocket: Attempting to connect to:",
						connectionUrl,
					);
					const ws = new WebSocket(connectionUrl);
					let connectionTimeout: NodeJS.Timeout | null = null;

					set((state) => {
						state.socket = ws;
					});
					console.log(
						"[WS Client] connectWebSocket: WebSocket instance created.",
					);

					ws.onopen = async () => {
						if (connectionTimeout) clearTimeout(connectionTimeout);
						console.log("[WS Client] WebSocket Event: onopen - Connected");

						set((state) => {
							state.reconnectAttempts = 0;
							state.isConnecting = false;
							// Don't set isAuthenticated here, wait for auth_success
						});

						try {
							console.log(
								`[WS Client] WebSocket Event: onopen - Sending authentication using ${tokenType} token...`,
							);
							const authMessage = JSON.stringify({
								type: "auth",
								token: token,
							}); // Sends the correct token
							ws.send(authMessage);
							console.log(
								"[WS Client] WebSocket Event: onopen - Authentication sent.",
							);
							// DO NOT restore subscriptions here immediately
						} catch (sendError) {
							console.error(
								"[WS Client] WebSocket Event: onopen - Failed to send auth message:",
								sendError,
							);
							actions.disconnectWebSocket(4001, "Failed to send auth");
							return;
						}
						// Subscriptions are restored *after* receiving auth_success in onmessage
					};

					ws.onmessage = (event) => {
						try {
							const message = JSON.parse(event.data) as WebSocketMessage;
							const messageType = message.type;

							set((state) => {
								// state is Draft<StoreState>
								let conversationId: string | undefined = undefined;
								if (
									message.type === "transcript" ||
									message.type === "analysis" ||
									message.type === "status" ||
									message.type === "audio"
								) {
									conversationId = message.payload.conversationId;
								} else if (
									message.type === "error" &&
									message.payload.conversationId
								) {
									conversationId = message.payload.conversationId;
								}

								if (conversationId) {
									if (!state.conversationResults[conversationId]) {
										state.conversationResults[conversationId] = {
											status: "processing",
											progress: 0,
										};
									}
									const currentResult =
										state.conversationResults[conversationId];

									switch (message.type) {
										case "transcript":
											currentResult.transcript = message.payload.content;
											currentResult.progress = Math.max(
												currentResult.progress || 0,
												50,
											);
											break;
										case "analysis":
											currentResult.analysis = message.payload.content;
											currentResult.progress = 100;
											currentResult.status = "completed";
											break;
										case "status":
											if (
												message.payload.status === "conversation_completed" ||
												message.payload.status === "completed"
											) {
												currentResult.status = "completed";
												currentResult.progress = 100;
												if (message.payload.gptResponse)
													currentResult.analysis = message.payload.gptResponse;
												if (message.payload.error) {
													currentResult.status = "error";
													currentResult.error = message.payload.error;
												}
											} else if (message.payload.status === "error") {
												currentResult.status = "error";
												currentResult.error =
													message.payload.error || "Unknown processing error";
												currentResult.progress = 100;
											} else {
												if (typeof message.payload.progress === "number") {
													currentResult.progress = Math.max(
														currentResult.progress || 0,
														message.payload.progress,
													);
												}
												if (
													currentResult.status !== "completed" &&
													currentResult.status !== "error"
												) {
													currentResult.status = "processing";
												}
											}
											break;
										case "audio":
											if (message.payload.status === "transcribed") {
												currentResult.progress = Math.max(
													currentResult.progress || 0,
													40,
												);
											} else if (message.payload.status === "failed") {
												currentResult.status = "error";
												currentResult.error =
													message.payload.error || "Audio processing failed";
												currentResult.progress = 100;
											}
											break;
										case "error":
											currentResult.status = "error";
											currentResult.error =
												message.payload.error || "Unknown error";
											currentResult.progress = 100;
											break;
									}
								} else if (message.type === "error") {
									console.error(
										"[WS Client] Received global error:",
										message.payload.error,
									);
								}

								// --- Handle Authentication Success ---
								if (messageType === "auth_success") {
									console.log(
										`[WS Client] WebSocket Event: onmessage - Authentication successful. User ID: ${message.userId}`,
									);
									state.isAuthenticated = true; // Set auth state
									// Trigger subscription restoration *after* setting auth state
									actions._restoreSubscriptions();
								} else if (messageType === "subscription_confirmed") {
									console.log(
										`[WS Client] WebSocket Event: onmessage - Subscription confirmed for topic: ${message.payload.topic}`,
									);
								}
								// --- End Auth Success Handling ---

								state.wsMessages.push(message);
								if (state.wsMessages.length > MAX_WS_MESSAGES) {
									state.wsMessages = state.wsMessages.slice(-MAX_WS_MESSAGES);
								}
							});
						} catch (error) {
							console.error(
								"[WS Client] WebSocket Event: onmessage - Failed to parse/process:",
								error,
								"Raw:",
								event.data,
							);
						}
					};

					ws.onclose = (event) => {
						if (connectionTimeout) clearTimeout(connectionTimeout);
						console.log(
							`[WS Client] WebSocket Event: onclose - Code ${event.code}, Reason: ${event.reason || "No reason"}`,
						);

						if (get().socket !== ws) {
							console.log(
								"[WS Client] WebSocket Event: onclose - Stale event ignored.",
							);
							return;
						}

						let shouldReconnect = true;
						let isAuthError = false;

						switch (event.code) {
							case 1000:
							case 1001:
								shouldReconnect = false;
								console.log(
									"[WS Client] WebSocket Event: onclose - Normal closure.",
								);
								break;
							case 1008:
							case 4001:
							case 4002:
							case 4003:
							case 4008:
								shouldReconnect = false;
								isAuthError = true;
								console.error(
									`[WS Client] WebSocket Event: onclose - Auth/Policy error (Code: ${event.code}). Reconnection stopped.`,
								);
								break;
							case 1006:
								console.warn(
									"[WS Client] WebSocket Event: onclose - Abnormal closure (1006). Will attempt reconnect.",
								);
								break;
							default:
								console.log(
									`[WS Client] WebSocket Event: onclose - Unexpected (Code: ${event.code}). Will attempt reconnect.`,
								);
						}

						set((state) => {
							// state is Draft<StoreState>
							state.socket = null;
							state.isConnecting = false;
							state.connectionPromise = null;
							state.isAuthenticated = false; // Reset auth status
							if (!isAuthError && !shouldReconnect) {
								state.reconnectAttempts = 0;
							}
						});

						if (
							shouldReconnect &&
							get().reconnectAttempts < get().maxReconnectAttempts
						) {
							const reconnectDelay = actions.calculateBackoff();
							console.log(
								`[WS Client] WebSocket Event: onclose - Scheduling reconnect in ${Math.round(reconnectDelay / 1000)}s (attempt ${get().reconnectAttempts + 1}/${get().maxReconnectAttempts})`,
							);
							setTimeout(() => {
								if (!get().socket && !get().isConnecting) {
									set((state) => {
										state.reconnectAttempts += 1;
									}); // Use Immer set
									actions.connectWebSocket();
								} else {
									console.log(
										"[WS Client] Reconnect cancelled: Already connected/connecting.",
									);
								}
							}, reconnectDelay);
						} else if (shouldReconnect) {
							console.warn(
								"[WS Client] WebSocket Event: onclose - Max reconnect attempts reached. Stopping automatic retries.",
							);
						}
					};

					ws.onerror = (event: Event | { message?: string }) => {
						if (connectionTimeout) clearTimeout(connectionTimeout);
						const errorMessage =
							(event as { message?: string }).message ||
							"WebSocket Error Event";
						console.error(
							`[WS Client] WebSocket Event: onerror - ${errorMessage}`,
							event,
						);

						if (get().socket !== ws) {
							console.log(
								"[WS Client] WebSocket Event: onerror - Stale event ignored.",
							);
							return;
						}

						if (
							ws.readyState === WebSocket.OPEN ||
							ws.readyState === WebSocket.CONNECTING
						) {
							ws.close(1011, "WebSocket error occurred");
						}
						set((state) => {
							// state is Draft<StoreState>
							state.isConnecting = false;
							state.connectionPromise = null;
							state.isAuthenticated = false; // Reset auth status
						});
					};

					connectionTimeout = setTimeout(() => {
						connectionTimeout = null;
						if (ws.readyState === WebSocket.CONNECTING) {
							console.warn(
								"[WS Client] connectWebSocket: Connection timed out. Closing socket.",
							);
							ws.close(4008, "Connection timeout");
						}
					}, CONNECTION_TIMEOUT_MS);
				} catch (error) {
					console.error(
						"[WS Client] connectWebSocket: Failed to initiate connection:",
						error,
					);
					set((state) => {
						// state is Draft<StoreState>
						state.isConnecting = false;
						state.connectionPromise = null;
						state.isAuthenticated = false; // Reset auth status
						if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
							state.socket.close(1011, "Initial setup error");
						}
						state.socket = null;
					});

					if (get().reconnectAttempts < get().maxReconnectAttempts) {
						const backoffDelay = actions.calculateBackoff();
						console.log(
							`[WS Client] Scheduling reconnect after initiation error in ${Math.round(backoffDelay / 1000)}s`,
						);
						setTimeout(() => {
							if (!get().socket && !get().isConnecting) {
								set((state) => {
									state.reconnectAttempts += 1;
								}); // Use Immer set
								actions.connectWebSocket();
							} else {
								console.log(
									"[WS Client] Reconnect cancelled: Already connected/connecting.",
								);
							}
						}, backoffDelay);
					} else {
						console.warn(
							"[WS Client] Max reconnect attempts reached after initial failure.",
						);
					}
				} finally {
					resolveConnectionPromise();
				}
			};

			await connectLogic();
		}, // End of connectWebSocket

		subscribeToConversation: async (conversationId: string) => {
			console.log(
				`[WS Client] subscribeToConversation: Requesting subscription for ${conversationId}`,
			);
			const state = get();
			const socket = state.socket;
			const topic = `conversation:${conversationId}`;
			let shouldSend = false;

			try {
				const storedTopics = await AsyncStorage.getItem(
					WEBSOCKET_SUBSCRIPTIONS_KEY,
				);
				const topics: string[] = storedTopics ? JSON.parse(storedTopics) : [];
				if (!topics.includes(topic)) {
					topics.push(topic);
					await AsyncStorage.setItem(
						WEBSOCKET_SUBSCRIPTIONS_KEY,
						JSON.stringify(topics),
					);
					console.log(
						`[WS Client] subscribeToConversation: Stored request for ${topic}`,
					);
					shouldSend = true; // Send only if it was newly stored
				} else {
					// If already stored, check if we are authenticated and connected, maybe send again?
					// For simplicity, only send if newly stored or if explicitly called when already connected/auth
					shouldSend =
						state.isAuthenticated && socket?.readyState === WebSocket.OPEN;
					if (!shouldSend) {
						console.log(
							`[WS Client] subscribeToConversation: Already subscribed or not ready to send for ${topic}`,
						);
					}
				}
			} catch (e: unknown) {
				console.error(
					"[WS Client] subscribeToConversation: Failed to store/check request:",
					e instanceof Error ? e.message : e,
				);
			}

			if (
				shouldSend &&
				socket?.readyState === WebSocket.OPEN &&
				state.isAuthenticated
			) {
				try {
					// --- FIX: Structure the message correctly ---
					const subscribeMessage = JSON.stringify({
						type: "subscribe",
						payload: { topic: topic }, // Ensure topic is nested under payload
					});
					// --- END FIX ---
					socket.send(subscribeMessage);
					console.log(
						`[WS Client] subscribeToConversation: Sent subscribe for ${topic}`,
					);
				} catch (e) {
					console.error(
						`[WS Client] subscribeToConversation: Failed to send subscribe for ${topic}:`,
						e,
					);
				}
			} else {
				const socketState = socket
					? WebSocket.CONNECTING === socket.readyState
						? "CONNECTING"
						: WebSocket.CLOSING === socket.readyState
							? "CLOSING"
							: WebSocket.CLOSED === socket.readyState
								? "CLOSED"
								: "UNKNOWN"
					: "null";
				const authState = state.isAuthenticated
					? "Authenticated"
					: "Not Authenticated";
				console.log(
					`[WS Client] subscribeToConversation: Socket not ready/authenticated to send subscribe for ${topic}. Socket: ${socketState}, Auth: ${authState}, Stored: ${!shouldSend}.`,
				);
				// Attempt reconnect if socket is closed and not connecting
				if (
					!socket ||
					(socket.readyState === WebSocket.CLOSED && !state.isConnecting)
				) {
					console.log(
						"[WS Client] subscribeToConversation: Socket closed, attempting reconnect.",
					);
					actions.connectWebSocket();
				}
			}
		}, // End of subscribeToConversation

		unsubscribeFromConversation: async (conversationId: string) => {
			const state = get();
			const socket = state.socket;
			const topic = `conversation:${conversationId}`;
			console.log(
				`[WS Client] unsubscribeFromConversation: Requesting unsubscription for ${topic}`,
			);

			try {
				const storedTopics = await AsyncStorage.getItem(
					WEBSOCKET_SUBSCRIPTIONS_KEY,
				);
				let topics: string[] = storedTopics ? JSON.parse(storedTopics) : [];
				topics = topics.filter((t) => t !== topic);
				await AsyncStorage.setItem(
					WEBSOCKET_SUBSCRIPTIONS_KEY,
					JSON.stringify(topics),
				);
				console.log(
					`[WS Client] unsubscribeFromConversation: Removed stored request for ${topic}`,
				);
			} catch (e: unknown) {
				console.error(
					"[WS Client] unsubscribeFromConversation: Failed to remove stored request:",
					e instanceof Error ? e.message : e,
				);
			}

			if (socket?.readyState === WebSocket.OPEN && state.isAuthenticated) {
				try {
					// --- FIX: Structure the message correctly ---
					const unsubscribeMessage = JSON.stringify({
						type: "unsubscribe",
						payload: { topic: topic }, // Ensure topic is nested under payload
					});
					// --- END FIX ---
					socket.send(unsubscribeMessage);
					console.log(
						`[WS Client] unsubscribeFromConversation: Sent unsubscribe for ${topic}`,
					);
				} catch (e) {
					console.error(
						`[WS Client] unsubscribeFromConversation: Failed to send unsubscribe for ${topic}:`,
						e,
					);
				}
			} else {
				const socketState = socket
					? WebSocket.CONNECTING === socket.readyState
						? "CONNECTING"
						: WebSocket.CLOSING === socket.readyState
							? "CLOSING"
							: WebSocket.CLOSED === socket.readyState
								? "CLOSED"
								: "UNKNOWN"
					: "null";
				const authState = state.isAuthenticated
					? "Authenticated"
					: "Not Authenticated";
				console.log(
					`[WS Client] unsubscribeFromConversation: Socket not ready/authenticated to send unsubscribe for ${topic}. Socket: ${socketState}, Auth: ${authState}`,
				);
			}
		}, // End of unsubscribeFromConversation

		clearMessages: () => {
			set((state) => {
				// state is Draft<StoreState>
				state.wsMessages = [];
			});
		},
	}; // End of actions object

	// Return the slice, combining initial state and actions
	return {
		...initialState,
		...actions,
	};
};
