/**
 * Authentication related type definitions
 */

/**
 * Authentication state interface
 */
export interface AuthState {
  /** Whether the authentication is currently being loaded */
  isLoading: boolean;
  /** Whether there is an authentication error */
  hasError: boolean;
  /** Authentication error message if any */
  errorMessage: string;
}

/**
 * Authentication credentials interface for local storage
 */
export interface AuthCredentials {
  /** User identifier (email) */
  identifier: string;
  /** User password */
  password: string;
}

/**
 * Authentication token interface
 */
export interface AuthToken {
  /** The JWT token string */
  token: string;
  /** When the token was issued */
  issuedAt: number;
  /** When the token expires */
  expiresAt: number;
}

/**
 * Authentication token context state
 */
export interface AuthTokenContextState {
  /** Whether the token has been initialized */
  tokenInitialized: boolean;
  /** Error message if token initialization failed */
  errorMessage?: string;
}

/**
 * Authentication hook return interface
 */
export interface AuthTokenHook {
  /** Function to get a fresh authentication token */
  getFreshToken: (force?: boolean) => Promise<string>;
  /** Whether a token is currently being refreshed */
  isRefreshing: boolean;
  /** Last error encountered during token operations */
  lastError?: Error;
  /** Number of retry attempts made */
  retryCount: number;
  /** Clear any stored token, effectively logging the user out */
  clearToken: () => Promise<void>;
  /** Validate whether the current token is still valid */
  validateToken: () => Promise<boolean>;
  /** Current token status */
  tokenStatus: TokenStatus;
}

/**
 * Password update form state
 */
export interface PasswordUpdateState {
  /** Current password */
  currentPassword: string;
  /** New password */
  password: string;
  /** Confirmation of new password */
  confirmPassword: string;
  /** Whether the form is currently being submitted */
  isLoading: boolean;
  /** Whether to show the current password */
  showCurrentPassword: boolean;
  /** Whether to show the new password */
  showNewPassword: boolean;
  /** Whether to show the password confirmation */
  showConfirmPassword: boolean;
  /** Error message if any */
  error: string;
}

/**
 * Sign-in form state
 */
export interface SignInState {
  /** Email address for sign in */
  emailAddress: string;
  /** Password for sign in */
  password: string;
  /** Whether the form is currently being submitted */
  isLoading: boolean;
  /** Error message if any */
  error: string;
}

/**
 * Sign-up form state
 */
export interface SignUpState {
  /** Email address for sign up */
  emailAddress: string;
  /** Password for sign up */
  password: string;
  /** Whether email verification is pending */
  pendingVerification: boolean;
  /** Verification code for email */
  code: string;
  /** Whether the form is currently being submitted */
  isLoading: boolean;
  /** Error message if any */
  error: string;
}

/**
 * Enhanced forgot password state with multi-step flow support
 */
export interface ForgotPasswordState {
  /** Email address for password reset */
  emailAddress: string;
  /** Current step in the password reset flow */
  step: "request" | "verification" | "reset";
  /** Verification code for email */
  code: string;
  /** New password */
  password: string;
  /** Confirmation of new password */
  confirmPassword: string;
  /** Whether the form is currently being submitted */
  isLoading: boolean;
  /** Error message if any */
  error: string;
  /** Whether the process completed successfully */
  isSuccess: boolean;
}

/**
 * Token status type
 */
export type TokenStatus = "valid" | "expired" | "invalid" | "unknown";

/**
 * Token metadata interface
 */
export interface TokenMetadata {
  /** The token string */
  token: string;
  /** When the token expires (timestamp) */
  expiryTime: number | null;
  /** When the token was issued (timestamp) */
  issuedAt: number;
  /** Time-to-live in milliseconds */
  ttl: number;
}

/**
 * Authentication error with code
 */
export class AuthError extends Error {
  /** Error code for more specific handling */
  code: string;

  constructor(message: string, code: string = "unknown_error") {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}
