/**
 * Validation utilities tests
 */
import { 
  validateEmail, 
  validatePassword, 
  validatePasswordMatch,
  validateVerificationCode,
  validateForm
} from '../../utils/validation';

describe('Email validation', () => {
  it('should validate correct email addresses', () => {
    expect(validateEmail('user@example.com').isValid).toBe(true);
    expect(validateEmail('name.surname@domain.co.uk').isValid).toBe(true);
    expect(validateEmail('info@company-name.com').isValid).toBe(true);
  });

  it('should reject invalid email addresses', () => {
    expect(validateEmail('').isValid).toBe(false);
    expect(validateEmail('invalid').isValid).toBe(false);
    expect(validateEmail('user@').isValid).toBe(false);
    expect(validateEmail('@domain.com').isValid).toBe(false);
    expect(validateEmail('user@domain').isValid).toBe(false);
    expect(validateEmail('user domain.com').isValid).toBe(false);
  });

  it('should provide appropriate error messages', () => {
    expect(validateEmail('').errorMessage).toBe('Email is required');
    expect(validateEmail('invalid').errorMessage).toBe('Please enter a valid email address');
  });
});

describe('Password validation', () => {
  it('should validate strong passwords', () => {
    expect(validatePassword('Password123').isValid).toBe(true);
    expect(validatePassword('SecureP@ssw0rd').isValid).toBe(true);
  });

  it('should reject weak passwords', () => {
    expect(validatePassword('').isValid).toBe(false);
    expect(validatePassword('short').isValid).toBe(false);
    expect(validatePassword('onlylowercase').isValid).toBe(false);
    expect(validatePassword('ONLYUPPERCASE').isValid).toBe(false);
    expect(validatePassword('NoNumbers').isValid).toBe(false);
  });

  it('should respect minimum length parameter', () => {
    expect(validatePassword('Abc123', 6).isValid).toBe(true);
    expect(validatePassword('Abc123', 10).isValid).toBe(false);
  });

  it('should provide appropriate error messages', () => {
    expect(validatePassword('').errorMessage).toBe('Password is required');
    expect(validatePassword('short').errorMessage).toBe('Password must be at least 8 characters');
    expect(validatePassword('onlylowercase').errorMessage)
      .toBe('Password should include at least one number, one uppercase, and one lowercase letter');
  });
});

describe('Password match validation', () => {
  it('should validate matching passwords', () => {
    expect(validatePasswordMatch('Password123', 'Password123').isValid).toBe(true);
  });

  it('should reject non-matching passwords', () => {
    expect(validatePasswordMatch('Password123', 'Password124').isValid).toBe(false);
    expect(validatePasswordMatch('Password', 'password').isValid).toBe(false);
  });

  it('should provide appropriate error message', () => {
    expect(validatePasswordMatch('Password123', 'DifferentPass').errorMessage)
      .toBe('Passwords do not match');
  });
});

describe('Verification code validation', () => {
  it('should validate correct verification codes', () => {
    expect(validateVerificationCode('123456').isValid).toBe(true);
  });

  it('should reject invalid verification codes', () => {
    expect(validateVerificationCode('').isValid).toBe(false);
    expect(validateVerificationCode('12345').isValid).toBe(false); // Too short
    expect(validateVerificationCode('1234567').isValid).toBe(false); // Too long
    expect(validateVerificationCode('abcdef').isValid).toBe(false); // Not numeric
  });

  it('should respect custom length parameter', () => {
    expect(validateVerificationCode('1234', 4).isValid).toBe(true);
    expect(validateVerificationCode('123456', 4).isValid).toBe(false);
  });
});

describe('Form validation', () => {
  it('should validate a form with multiple fields', () => {
    const formValues = {
      email: 'user@example.com',
      password: 'Password123',
      confirmPassword: 'Password123'
    };
    
    const validationMap = {
      email: validateEmail,
      password: (value: string) => validatePassword(value),
      confirmPassword: (value: string) => validatePasswordMatch(formValues.password, value)
    };
    
    const result = validateForm(formValues, validationMap);
    expect(result.isValid).toBe(true);
    expect(Object.keys(result.fieldErrors).length).toBe(0);
  });
  
  it('should return errors for invalid fields', () => {
    const formValues = {
      email: 'invalid',
      password: 'short',
      confirmPassword: 'nomatch'
    };
    
    const validationMap = {
      email: validateEmail,
      password: (value: string) => validatePassword(value),
      confirmPassword: (value: string) => validatePasswordMatch(formValues.password, value)
    };
    
    const result = validateForm(formValues, validationMap);
    expect(result.isValid).toBe(false);
    expect(Object.keys(result.fieldErrors).length).toBe(3);
    expect(result.fieldErrors.email).toBeDefined();
    expect(result.fieldErrors.password).toBeDefined();
    expect(result.fieldErrors.confirmPassword).toBeDefined();
  });
});