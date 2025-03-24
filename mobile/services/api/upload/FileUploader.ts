import { ApiError } from "../error/ApiError";

import type { ApiConfig, FileUploadOptions } from "../types";

interface ReactNativeFile {
  uri: string;
  name: string;
  type: string;
}

export class FileUploader {
  private readonly config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private buildUrl(endpoint: string): string {
    const normalizedEndpoint = endpoint.startsWith("/")
      ? endpoint
      : `/${endpoint}`;
    return `${this.config.baseUrl}/${this.config.version}${normalizedEndpoint}`;
  }

  private getDefaultHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      "X-App-Version": this.config.appVersion,
      "X-Platform": this.config.platform,
    };
  }

  async upload<T>(
    endpoint: string,
    token: string,
    options: FileUploadOptions,
  ): Promise<T> {
    const {
      uri,
      fieldName = "file",
      fileName,
      mimeType = "application/octet-stream",
      data = {},
      onProgress,
    } = options;

    const url = this.buildUrl(endpoint);
    const formData = new FormData();

    // Add file
    const fileObj: ReactNativeFile = {
      uri,
      name: fileName || uri.split("/").pop() || "file",
      type: mimeType,
    };

    formData.append(fieldName, fileObj as unknown as Blob);

    // Add other data
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, String(value));
      }
    });

    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let responseData: Record<string, unknown>;

          try {
            responseData = JSON.parse(xhr.responseText);
          } catch {
            responseData = {}; // Empty response
          }

          resolve(responseData as T);
        } else {
          let errorMessage = `Upload failed with status ${xhr.status}`;
          let errorCode = "UPLOAD_FAILED";
          const errorOptions: { 
            status: number;
            isAuthError?: boolean;
            isRateLimitError?: boolean;
            isServerError?: boolean;
          } = { status: xhr.status };

          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMessage = errorData.error || errorData.message || errorMessage;
            errorCode = errorData.code || errorCode;
          } catch {
            // Ignore JSON parsing errors
          }

          if (xhr.status === 401 || xhr.status === 403) {
            errorOptions.isAuthError = true;
          } else if (xhr.status === 429) {
            errorOptions.isRateLimitError = true;
          } else if (xhr.status >= 500) {
            errorOptions.isServerError = true;
          }

          reject(
            new ApiError(errorMessage, {
              ...errorOptions,
              code: errorCode,
            }),
          );
        }
      };

      xhr.onerror = () => {
        reject(ApiError.network("Network error during file upload"));
      };

      xhr.ontimeout = () => {
        reject(ApiError.timeout("File upload timed out"));
      };

      xhr.open("POST", url);

      // Add headers
      const headers = this.getDefaultHeaders(token);
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.send(formData);
    });
  }

  async uploadMultiple<T>(
    endpoint: string,
    token: string,
    uris: string[],
    options: Omit<FileUploadOptions, "uri"> = {},
  ): Promise<T[]> {
    return Promise.all(
      uris.map((uri) =>
        this.upload<T>(endpoint, token, {
          ...options,
          uri,
        }),
      ),
    );
  }
}
