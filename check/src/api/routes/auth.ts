import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "@/utils/async-handler";
import { log } from "@/utils/logger";
import { CaptchaService } from "@/services/captcha-service";
import { AccountLockoutService } from "@/services/account-lockout-service";
import { authRateLimitMiddleware, isRateLimitingEnabled } from "@/middleware/auth-rate-limit";
import { formatError } from "@/utils/error-formatter";

const router = Router();

/**
 * Get CAPTCHA challenge
 * GET /api/auth/captcha
 */
const getCaptchaChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const challenge = await CaptchaService.generateCaptchaChallenge();
    
    res.json({
      success: true,
      data: {
        challengeId: challenge.challengeId,
        question: challenge.question,
        type: challenge.type
      }
    });
  } catch (error) {
    log.error("Error generating CAPTCHA challenge", { error: formatError(error) });
    res.status(500).json({
      success: false,
      error: "Failed to generate CAPTCHA challenge"
    });
  }
};

/**
 * Verify CAPTCHA response
 * POST /api/auth/captcha/verify
 */
const verifyCaptchaResponse = async (req: Request, res: Response): Promise<void> => {
  const { challengeId, response } = req.body;
  
  if (!challengeId || !response) {
    res.status(400).json({
      success: false,
      error: "Challenge ID and response are required"
    });
    return;
  }
  
  try {
    const result = await CaptchaService.validateCaptchaResponse(challengeId, response);
    
    if (result.valid) {
      // Generate a CAPTCHA token for this IP
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const token = await CaptchaService.generateCaptchaToken(ip);
      
      res.json({
        success: true,
        data: {
          valid: true,
          message: result.message,
          captchaToken: token
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || "Invalid CAPTCHA response"
      });
    }
  } catch (error) {
    log.error("Error verifying CAPTCHA response", { error: formatError(error) });
    res.status(500).json({
      success: false,
      error: "Failed to verify CAPTCHA response"
    });
  }
};

/**
 * Request account unlock email
 * POST /api/auth/unlock-request
 */
const requestUnlock = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  
  if (!email) {
    res.status(400).json({
      success: false,
      error: "Email is required"
    });
    return;
  }
  
  try {
    // Always return success to avoid leaking user existence
    await AccountLockoutService.initiateUnlockProcess(email);
    
    res.json({
      success: true,
      message: "If an account exists with this email, unlock instructions have been sent."
    });
  } catch (error) {
    log.error("Error in unlock request", { email, error: formatError(error) });
    
    // Still return success to avoid leaking information
    res.json({
      success: true,
      message: "If an account exists with this email, unlock instructions have been sent."
    });
  }
};

/**
 * Verify unlock token and unlock account
 * POST /api/auth/unlock-verify
 */
const verifyUnlock = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body;
  
  if (!token) {
    res.status(400).json({
      success: false,
      error: "Unlock token is required"
    });
    return;
  }
  
  try {
    const unlocked = await AccountLockoutService.verifyAndUnlockAccount(token);
    
    if (unlocked) {
      res.json({
        success: true,
        message: "Account unlocked successfully. You can now log in."
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Invalid or expired unlock token"
      });
    }
  } catch (error) {
    log.error("Error verifying unlock token", { error: formatError(error) });
    res.status(500).json({
      success: false,
      error: "Failed to unlock account"
    });
  }
};

/**
 * Get rate limit statistics (admin only)
 * GET /api/auth/rate-limit-stats
 */
const getRateLimitStats = async (req: Request, res: Response): Promise<void> => {
  // TODO: Add admin authentication check
  
  try {
    const { FailedLoginService } = await import('@/services/failed-login-service');
    const stats = await FailedLoginService.getStatistics();
    const captchaStats = await CaptchaService.getStatistics();
    
    res.json({
      success: true,
      data: {
        failedLogins: stats,
        captcha: captchaStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    log.error("Error getting rate limit stats", { error: formatError(error) });
    res.status(500).json({
      success: false,
      error: "Failed to get statistics"
    });
  }
};

// Routes
router.get("/captcha", asyncHandler(getCaptchaChallenge));
router.post("/captcha/verify", asyncHandler(verifyCaptchaResponse));
router.post("/unlock-request", asyncHandler(requestUnlock));
router.post("/unlock-verify", asyncHandler(verifyUnlock));

// Admin route (should be protected in production)
if (process.env.NODE_ENV === 'development') {
  router.get("/rate-limit-stats", asyncHandler(getRateLimitStats));
}

export default router;