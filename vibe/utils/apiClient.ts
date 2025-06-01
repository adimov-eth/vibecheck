// /Users/adimov/Developer/final/vibe/utils/apiClient.ts
// NEW FILE
import { getAuthorizationHeader } from "./auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
	console.error(
		"[API Client] EXPO_PUBLIC_API_URL environment variable is not set.",
	);
	throw new Error("API URL is not configured");
}

/**
 * Custom error class for authentication errors (e.g., 401 Unauthorized).
 */
export class AuthenticationError extends Error {
	constructor(message = "Authentication required") {
		super(message);
		this.name = "AuthenticationError";
	}
}

/**
 * Custom error class for general API errors.
 */
export class ApiError extends Error {
	status: number;
	body?: unknown;

	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

/**
 * Performs a fetch request with automatic authorization header injection
 * and standardized error handling.
 *
 * @param endpoint The API endpoint (e.g., '/users/usage')
 * @param options Standard Fetch options (method, body, etc.)
 * @returns The parsed JSON response.
 * @throws {AuthenticationError} If the response status is 401.
 * @throws {ApiError} For other non-2xx response statuses.
 * @throws {Error} For network errors or other unexpected issues.
 */
export const fetchWithAuth = async <T>(
	endpoint: string,
	options: RequestInit = {},
): Promise<T> => {
	const url = `${API_URL}${endpoint}`;
	console.log(`[API Client] Requesting: ${options.method || "GET"} ${url}`);

	const authHeader = await getAuthorizationHeader();
	if (!authHeader) {
		console.error(
			`[API Client] No auth header available for ${url}. Throwing AuthenticationError.`,
		);
		throw new AuthenticationError("No authentication token available.");
	}

	const headers = {
		"Content-Type": "application/json",
		...options.headers,
		Authorization: authHeader,
	};

	try {
		const response = await fetch(url, { ...options, headers });

		// Handle 401 Unauthorized specifically
		if (response.status === 401) {
			console.warn(
				`[API Client] Received 401 Unauthorized for ${url}. Throwing AuthenticationError.`,
			);
			throw new AuthenticationError("Unauthorized: Invalid or expired token.");
		}

		// Try parsing JSON regardless of status for potential error details
		let responseBody: unknown;
		try {
			responseBody = await response.json();
		} catch (e) {
			// If JSON parsing fails, use text body if available
			try {
				responseBody = await response.text();
			} catch (textErr) {
				responseBody = `Failed to read response body (Status: ${response.status})`;
			}
		}

		// Handle other non-successful responses
		if (!response.ok) {
			const errorMessage =
				`API Error: ${response.status} ${response.statusText || ""}`.trim();
			console.error(
				`[API Client] Request failed for ${url}: ${errorMessage}`,
				responseBody,
			);
			throw new ApiError(errorMessage, response.status, responseBody);
		}

		console.log(
			`[API Client] Request successful: ${options.method || "GET"} ${url} (Status: ${response.status})`,
		);
		return responseBody as T;
	} catch (error) {
		// Re-throw specific errors or wrap generic errors
		if (error instanceof AuthenticationError || error instanceof ApiError) {
			throw error;
		}

		// Handle network errors or other unexpected fetch issues
		const networkErrorMessage = `Network request failed for ${url}: ${error instanceof Error ? error.message : String(error)}`;
		console.error(`[API Client] ${networkErrorMessage}`);
		throw new Error(networkErrorMessage);
	}
};
