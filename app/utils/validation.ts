/**
 * Form validation utilities
 * Contains functions for validating common form fields like email, password, etc.
 */

/**
 * Interface for validation result
 */
export interface ValidationResult {
  /** Whether the validation passed */
  isValid: boolean;
  /** Error message if validation failed */
  errorMessage: string;
}

/**
 * Validates an email address
 * @param email - Email address to validate
 * @returns ValidationResult with validity and error message
 */
export function validateEmail(email: string): ValidationResult {
  // Basic email regex pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email.trim()) {
    return {
      isValid: false,
      errorMessage: 'Email is required'
    };
  }
  
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      errorMessage: 'Please enter a valid email address'
    };
  }
  
  return {
    isValid: true,
    errorMessage: ''
  };
}

/**
 * Validates a password based on strength requirements
 * @param password - Password to validate
 * @param minLength - Minimum password length (default: 8)
 * @returns ValidationResult with validity and error message
 */
export function validatePassword(password: string, minLength = 8): ValidationResult {
  if (!password) {
    return {
      isValid: false,
      errorMessage: 'Password is required'
    };
  }
  
  if (password.length < minLength) {
    return {
      isValid: false,
      errorMessage: `Password must be at least ${minLength} characters`
    };
  }
  
  // Check for moderate password strength (optional)
  // Has at least one number, one lowercase and one uppercase letter
  const hasNumber = /\d/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  
  if (!(hasNumber && hasUpperCase && hasLowerCase)) {
    return {
      isValid: false,
      errorMessage: 'Password should include at least one number, one uppercase, and one lowercase letter'
    };
  }
  
  return {
    isValid: true,
    errorMessage: ''
  };
}

/**
 * Validates matching passwords (for password confirmation)
 * @param password - Original password
 * @param confirmPassword - Confirmation password to match
 * @returns ValidationResult with validity and error message
 */
export function validatePasswordMatch(password: string, confirmPassword: string): ValidationResult {
  if (password !== confirmPassword) {
    return {
      isValid: false,
      errorMessage: 'Passwords do not match'
    };
  }
  
  return {
    isValid: true,
    errorMessage: ''
  };
}

/**
 * Validates a verification code
 * @param code - Verification code to validate
 * @param length - Expected length of the code (default: 6)
 * @returns ValidationResult with validity and error message
 */
export function validateVerificationCode(code: string, length = 6): ValidationResult {
  if (!code.trim()) {
    return {
      isValid: false,
      errorMessage: 'Verification code is required'
    };
  }
  
  // Only allow numbers
  if (!/^\d+$/.test(code)) {
    return {
      isValid: false,
      errorMessage: 'Verification code should contain only numbers'
    };
  }
  
  if (code.length !== length) {
    return {
      isValid: false,
      errorMessage: `Verification code should be ${length} digits`
    };
  }
  
  return {
    isValid: true,
    errorMessage: ''
  };
}

/**
 * Validates form fields based on a validation map
 * @param values - Object containing form values
 * @param validationMap - Map of field names to validation functions
 * @returns Object with isValid flag and fieldErrors map
 */
export function validateForm<T extends Record<string, any>>(
  values: T,
  validationMap: Record<keyof T, (value: any) => ValidationResult>
): { isValid: boolean; fieldErrors: Partial<Record<keyof T, string>> } {
  const fieldErrors: Partial<Record<keyof T, string>> = {};
  let isValid = true;
  
  // Run each validation function against its field
  for (const field in validationMap) {
    if (Object.prototype.hasOwnProperty.call(validationMap, field)) {
      const validationFn = validationMap[field];
      const result = validationFn(values[field]);
      
      if (!result.isValid) {
        fieldErrors[field] = result.errorMessage;
        isValid = false;
      }
    }
  }
  
  return { isValid, fieldErrors };
}
