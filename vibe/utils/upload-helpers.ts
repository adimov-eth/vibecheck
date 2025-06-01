// /Users/adimov/Developer/final/vibe/utils/upload-helpers.ts
import * as FileSystem from "expo-file-system";
import { getAuthorizationHeader } from "./auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export interface UploadOptions {
	audioUri: string;
	conversationId: string; // Should be SERVER ID
	audioKey: string;
	onProgress: (progress: number) => void;
}

export interface UploadFileResult {
	success: boolean;
	url?: string; // URL if successful
	error?: string; // Error message if failed
	statusCode?: number; // HTTP status code
}

/**
 * Performs a foreground file upload using Expo FileSystem.
 * Handles authentication and progress reporting.
 */
export const uploadFile = async ({
	audioUri,
	conversationId,
	audioKey,
	onProgress,
}: UploadOptions): Promise<UploadFileResult> => {
	console.log(
		`[UploadHelper] Starting foreground upload: ConvID=${conversationId}, Key=${audioKey}, URI=${audioUri}`,
	);
	const authHeader = await getAuthorizationHeader();
	if (!authHeader) {
		console.error(
			`[UploadHelper] Authentication token missing for ${conversationId}_${audioKey}.`,
		);
		return {
			success: false,
			error: "401: Authentication token missing",
			statusCode: 401,
		};
	}

	try {
		const uploadTask = FileSystem.createUploadTask(
			`${API_URL}/audio/upload`,
			audioUri,
			{
				uploadType: FileSystem.FileSystemUploadType.MULTIPART,
				fieldName: "audio",
				parameters: { conversationId, audioKey }, // Send SERVER ID
				headers: { Authorization: authHeader },
				mimeType: "audio/m4a", // Adjust if needed
				httpMethod: "POST",
				sessionType: FileSystem.FileSystemSessionType.FOREGROUND, // Explicitly foreground
			},
			(progress) => {
				if (progress.totalBytesExpectedToSend > 0) {
					const percentComplete = Math.round(
						(progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100,
					);
					// Clamp progress between 0 and 100
					onProgress(Math.min(100, Math.max(0, percentComplete)));
				}
			},
		);

		console.log(
			`[UploadHelper] Executing uploadTask.uploadAsync() for ${conversationId}_${audioKey}`,
		);
		const response = await uploadTask.uploadAsync();
		console.log(
			`[UploadHelper] Upload complete for ${conversationId}_${audioKey}. Status: ${response?.status}`,
		);

		// Handle 401 specifically after upload attempt
		if (response?.status === 401) {
			console.warn(
				`[UploadHelper] Received 401 Unauthorized during upload for ${conversationId}_${audioKey}.`,
			);
			return { success: false, error: "401: Unauthorized", statusCode: 401 };
		}

		if (response && (response.status === 200 || response.status === 201)) {
			try {
				const result = JSON.parse(response.body);
				console.log(
					`[UploadHelper] Upload successful for ${conversationId}_${audioKey}. URL: ${result.url}`,
				);
				return { success: true, url: result.url, statusCode: response.status };
			} catch (parseError) {
				// Handle HTML or non-JSON responses
				console.error(
					`[UploadHelper] Failed to parse JSON response for ${conversationId}_${audioKey}:`,
					parseError,
				);
				const errorMessage = `${response.status}: Response parsing error (possible HTML instead of JSON)`;
				return {
					success: false,
					error: errorMessage,
					statusCode: response.status,
				};
			}
		}

		// Handle other error responses
		let errorMessage = `${response?.status || "Unknown Error"}: Upload failed`;
		let parsedMessage: string | undefined;

		if (response?.body) {
			try {
				const errorBodyJson = JSON.parse(response.body);
				// Use the message field from the parsed JSON if it exists
				if (typeof errorBodyJson?.message === "string") {
					parsedMessage = errorBodyJson.message;
					errorMessage = `${response.status}: ${parsedMessage}`;
				} else {
					// Fallback if 'message' field is missing or not a string
					console.warn(
						`[UploadHelper] JSON error response for ${conversationId}_${audioKey} lacks 'message' field or it's not a string. Body:`,
						response.body.substring(0, 200),
					);
					errorMessage = `${response.status}: Upload failed (Unexpected JSON structure)`;
				}
			} catch (parseError) {
				// Handle cases where the body is not valid JSON (e.g., HTML error page)
				console.warn(
					`[UploadHelper] Failed to parse error response body as JSON for ${conversationId}_${audioKey}. Status: ${response.status}. Body (first 200 chars):`,
					response.body.substring(0, 200),
				);
				// Keep the generic message but include truncated body for context
				const truncatedBody = response.body.substring(0, 150);
				errorMessage = `${response.status}: Upload failed (Non-JSON response): ${truncatedBody}`;
			}
		} else {
			console.warn(
				`[UploadHelper] Upload failed for ${conversationId}_${audioKey} with status ${response?.status} but no response body.`,
			);
			errorMessage = `${response?.status || "Unknown Error"}: Upload failed (No response body)`;
		}

		console.error(
			`[UploadHelper] Upload failed for ${conversationId}_${audioKey}. Status: ${response?.status}. Error: ${parsedMessage || errorMessage}`,
		); // Log the extracted/constructed message

		return {
			success: false,
			// Return the more specific message extracted from JSON if possible, otherwise the constructed one
			error: parsedMessage
				? `${response?.status}: ${parsedMessage}`
				: errorMessage,
			statusCode: response?.status,
		};
	} catch (error) {
		const errorMessageText =
			error instanceof Error ? error.message : String(error);
		console.error(
			`[UploadHelper] CATCH block: Foreground upload failed for ${conversationId}_${audioKey}:`,
			errorMessageText,
		);
		// Check if it's a network error or potentially an auth issue before the request was sent
		if (errorMessageText.includes("Network request failed")) {
			return { success: false, error: `Network Error: ${errorMessageText}` };
		}
		// Could potentially check for specific error types if needed
		return {
			success: false,
			error: `Upload execution error: ${errorMessageText}`,
		};
	}
};
