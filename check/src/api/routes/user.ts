import { getUserId, requireAuth } from "@/middleware/auth";
import { AuthenticationError, NotFoundError } from "@/middleware/error";
import { authRateLimitMiddleware, isRateLimitingEnabled } from "@/middleware/auth-rate-limit";
import { createSessionToken } from "@/services/session-service";
import { getUserUsageStats } from "@/services/usage-service";
import { AccountLockoutService } from "@/services/account-lockout-service";
import {
	authenticateWithApple,
	getUser,
	upsertUser,
} from "@/services/user-service";
import { userCacheMiddleware } from "@/middleware/cache";
import type { AuthenticatedRequest } from "@/types/common";
import { asyncHandler } from "@/utils/async-handler";
import { formatError } from "@/utils/error-formatter";
import { log } from "@/utils/logger";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

const router = Router();

/**
 * Get current user data with usage stats
 */
const getCurrentUser = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<unknown> => {
	const { userId } = req as AuthenticatedRequest;

	try {
		// Get user info and usage stats
		const [user, usageStats] = await Promise.all([
			getUser(userId),
			getUserUsageStats(userId),
		]);

		if (!user) {
			// User exists in auth but not in database
			// This shouldn't happen with proper middleware, but let's be defensive
			log.warn(
				"User found in auth but not in database - creating minimal record",
				{ userId },
			);

			// Create a minimal user record using auth data
			const authReq = req as AuthenticatedRequest;
			if (authReq.email) {
				const result = await upsertUser({
					id: userId,
					email: authReq.email,
					name: authReq.fullName
						? `${authReq.fullName.givenName} ${authReq.fullName.familyName}`.trim()
						: undefined,
				});

				if (result.success) {
					// Retry getting the user
					const createdUser = await getUser(userId);
					if (createdUser) {
						log.info("Successfully created and retrieved user", { userId });
						return res.json({
							id: createdUser.id,
							email: createdUser.email,
							name: createdUser.name,
							usage: {
								currentUsage: usageStats.currentUsage,
								limit: usageStats.limit,
								isSubscribed: usageStats.isSubscribed,
								remainingConversations: usageStats.remainingConversations,
								resetDate: usageStats.resetDate,
							},
						});
					}
				} else {
					log.error("Failed to create user", {
						userId,
						error: formatError(result.error),
					});
				}
			}

			// If we couldn't create the user with proper email, fall back to error
			throw new NotFoundError(`User not found: ${userId}`);
		}

		log.debug("User data retrieved successfully", { userId });
		return res.json({
			id: user.id,
			email: user.email,
			name: user.name,
			usage: {
				currentUsage: usageStats.currentUsage,
				limit: usageStats.limit,
				isSubscribed: usageStats.isSubscribed,
				remainingConversations: usageStats.remainingConversations,
				resetDate: usageStats.resetDate,
			},
		});
	} catch (error) {
		log.error("Error retrieving user data", {
			userId,
			error: formatError(error),
		});
		next(error);
	}
};

/**
 * Apple Sign In authentication
 * POST /api/user/apple-auth
 */
const appleAuth = async (req: Request, res: Response, next: NextFunction) => {
	const { identityToken, fullName, email } = req.body;

	if (!identityToken) {
		return res.status(400).json({
			success: false,
			error: "Identity token is required",
		});
	}

	// Check if account is locked (if email is provided)
	if (email && isRateLimitingEnabled()) {
		const isLocked = await AccountLockoutService.isAccountLocked(email);
		if (isLocked) {
			return res.status(403).json({
				success: false,
				error: "Account is locked due to security reasons. Please check your email for unlock instructions.",
				code: "ACCOUNT_LOCKED"
			});
		}
	}

	let formattedName: string | undefined;
	if (fullName?.givenName || fullName?.familyName) {
		formattedName =
			`${fullName.givenName || ""} ${fullName.familyName || ""}`.trim();
	}

	try {
		const authResult = await authenticateWithApple(
			identityToken,
			email,
			formattedName,
		);

		if (!authResult.success) {
			// Record failed attempt
			if (isRateLimitingEnabled() && email) {
				await authRateLimitMiddleware.recordFailure(req, email, authResult.error.message);
				
				// Check if account should be locked
				const shouldLock = await AccountLockoutService.checkAndLockAccount(email);
				if (shouldLock) {
					return res.status(403).json({
						success: false,
						error: "Account has been locked due to multiple failed login attempts. Please check your email for unlock instructions.",
						code: "ACCOUNT_LOCKED"
					});
				}
			}

			if (authResult.code === "EMAIL_ALREADY_EXISTS") {
				return res.status(409).json({
					success: false,
					error: authResult.error.message,
					code: authResult.code,
				});
			}
			return res.status(401).json({
				success: false,
				error: authResult.error.message,
			});
		}

		const user = authResult.data;

		// Reset rate limiting on successful auth
		if (isRateLimitingEnabled()) {
			await authRateLimitMiddleware.recordSuccess(req, user.email);
		}

		const sessionTokenResult = await createSessionToken(user.id);
		if (!sessionTokenResult.success) {
			// Access the error property for logging or more specific handling
			const errorMsg =
				sessionTokenResult.error?.message ||
				"Failed to create session token after authentication.";
			throw new Error(errorMsg);
		}
		const sessionToken = sessionTokenResult.data;

		log.info("User authenticated successfully with Apple, session created", {
			userId: user.id,
		});

		res.status(200).json({
			success: true,
			data: {
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
				},
				sessionToken: sessionToken,
			},
		});
	} catch (error) {
		log.error("Error in Apple authentication endpoint", {
			error: formatError(error),
		});
		next(error);
	}
};

/**
 * Get current user's usage stats
 */
const getUserUsage = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<unknown> => {
	const userId = getUserId(req as AuthenticatedRequest);
	if (!userId) {
		// This check might be redundant if requireAuth guarantees userId, but good defense
		return next(
			new AuthenticationError("Unauthorized: User ID missing for usage stats"),
		);
	}

	try {
		const usageStats = await getUserUsageStats(userId);
		log.debug("Retrieved usage stats", { userId });
		return res.json({ usage: usageStats });
	} catch (error) {
		log.error("Error retrieving usage stats", {
			userId,
			error: formatError(error),
		});
		next(error);
	}
};

// Apply rate limiting middleware conditionally
const rateLimitMiddlewares = isRateLimitingEnabled() 
  ? [
      authRateLimitMiddleware.byIP,
      authRateLimitMiddleware.progressive,
      authRateLimitMiddleware.captcha,
      asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        // Apply email-based rate limiting if email is provided
        const email = req.body.email;
        if (email) {
          await authRateLimitMiddleware.byEmail(() => email)(req, res, next);
        } else {
          next();
        }
      })
    ]
  : [];

// Routes
router.get("/me", requireAuth, userCacheMiddleware({ ttl: 300 }), asyncHandler(getCurrentUser));
router.post("/apple-auth", ...rateLimitMiddlewares, asyncHandler(appleAuth));
router.get("/usage", requireAuth, userCacheMiddleware({ ttl: 60 }), asyncHandler(getUserUsage));

export default router;
