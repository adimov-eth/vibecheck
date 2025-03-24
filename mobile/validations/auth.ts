import { z } from 'zod';

// Common validation rules
const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters');

// Sign in form validation
export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignInFormData = z.infer<typeof signInSchema>;

// Sign up form validation
export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: passwordSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type SignUpFormData = z.infer<typeof signUpSchema>;

// Forgot password form validation
export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordRequestData = z.infer<typeof forgotPasswordRequestSchema>;

export const forgotPasswordVerificationSchema = z.object({
  code: z.string().min(1, 'Verification code is required'),
});

export type ForgotPasswordVerificationData = z.infer<typeof forgotPasswordVerificationSchema>;

export const forgotPasswordResetSchema = z.object({
  newPassword: passwordSchema,
  confirmPassword: passwordSchema,
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ForgotPasswordResetData = z.infer<typeof forgotPasswordResetSchema>; 