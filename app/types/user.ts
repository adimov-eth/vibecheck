/**
 * User related type definitions
 */

/**
 * User profile interface
 */
export interface UserProfile {
  /** User ID (from Clerk) */
  id: string;
  /** User email address */
  email?: string;
  /** User display name */
  name?: string;
  /** When the user was created */
  createdAt: number;
  /** When the user was last updated */
  updatedAt: number;
}

/**
 * User context state
 */
export interface UserContextState {
  /** The current user profile */
  profile: UserProfile | null;
  /** Whether the profile is currently being loaded */
  isLoading: boolean;
  /** Whether there was an error loading the profile */
  hasError: boolean;
  /** Error message if any */
  errorMessage?: string;
  /** Function to refresh the user profile */
  refreshProfile: () => Promise<void>;
}

/**
 * User API response
 */
export interface UserProfileResponse {
  /** The user profile */
  user: UserProfile;
} 