import { ApiError } from "../error/ApiError";

import type { ApiConfig, ApiRequestOptions, ApiResponse } from "../types";

declare module "../types" {
  interface ApiRequestOptions {
    token?: string;
  }
}

export class NetworkManager {
  private readonly config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private buildUrl(endpoint: string, params?: Record<string, unknown>): string {
    const normalizedEndpoint = endpoint.startsWith("/")
      ? endpoint
      : `/${endpoint}`;
    let url = `${this.config.baseUrl}/${this.config.version}${normalizedEndpoint}`;

    if (params) {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, String(value));
        }
      });

      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  private getDefaultHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-App-Version": this.config.appVersion,
      "X-Platform": this.config.platform,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  async request<T>(
    method: string,
    endpoint: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const {
      params,
      body,
      headers = {},
      timeout = this.config.timeout
    } = options;

    const url = this.buildUrl(endpoint, params);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestHeaders = {
        ...this.getDefaultHeaders(options.token),
        ...headers,
      };

      const fetchOptions: RequestInit = {
        method,
        headers: requestHeaders,
        signal: controller.signal,
      };

      if (method !== "GET" && body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value: string, key: string) => {
        responseHeaders[key] = value;
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw ApiError.rateLimit(retryAfter ? parseInt(retryAfter) : undefined);
      }

      if (response.status === 401 || response.status === 403) {
        throw ApiError.auth(`${response.status} ${response.statusText}`);
      }

      if (response.status >= 500) {
        throw ApiError.server(response.status, response.statusText);
      }

      if (!response.ok) {
        let errorData: Record<string, unknown> = {};
        try {
          errorData = await response.json();
        } catch {
          // Ignore JSON parsing errors
        }

        throw new ApiError(
          String(errorData.error || 
            errorData.message || 
            `Request failed with status ${response.status}`),
          {
            status: response.status,
            code: String(errorData.code) || "REQUEST_FAILED",
          },
        );
      }

      let data: T;
      try {
        data = await response.json();
      } catch {
        data = {} as T;
      }

      return {
        data,
        status: response.status,
        headers: responseHeaders,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw ApiError.timeout();
      }

      if (
        error instanceof TypeError &&
        error.message.includes("Network request failed")
      ) {
        throw ApiError.network();
      }

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        error instanceof Error ? error.message : "Unknown error",
        { code: "UNKNOWN_ERROR" },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T>(
    endpoint: string,
    options?: Omit<ApiRequestOptions, "body">,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("GET", endpoint, options);
  }

  async post<T>(
    endpoint: string,
    body?: Record<string, unknown>,
    options?: Omit<ApiRequestOptions, "body">,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("POST", endpoint, { ...options, body });
  }

  async put<T>(
    endpoint: string,
    body?: Record<string, unknown>,
    options?: Omit<ApiRequestOptions, "body">,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", endpoint, { ...options, body });
  }

  async delete<T>(
    endpoint: string,
    options?: Omit<ApiRequestOptions, "body">,
  ): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", endpoint, options);
  }
}
