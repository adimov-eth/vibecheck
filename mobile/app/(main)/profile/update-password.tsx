import { ErrorMessage } from '@/components/feedback/ErrorMessage';
import { FormField } from '@/components/forms/FormField';
import { PasswordInput } from '@/components/forms/PasswordInput';
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, typography } from '@/constants/styles';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface FormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function UpdatePassword() {
  const router = useRouter();
  // Form state
  const [formData, setFormData] = useState<FormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Update form field helper
  const updateField = (field: keyof FormState, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user makes changes
    if (error) setError(null);
  };
  
  // Validate the form
  const validateForm = (): boolean => {
    // Check if current password is provided
    if (!formData.currentPassword.trim()) {
      setError('Current password is required');
      return false;
    }
    
    // Check if new password is provided
    if (!formData.newPassword.trim()) {
      setError('New password is required');
      return false;
    }
    
    // Check if new password is at least 8 characters
    if (formData.newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return false;
    }
    
    // Check if passwords match
    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    return true;
  };
  
  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // In a real app, this would make an API call to change the password
      // For now we'll just simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Show success toast
      showToast.success('Password Updated', 'Your password has been successfully updated');
      
      // Navigate back to profile
      router.back();
    } catch (err) {
      // Handle errors
      const errorMessage = err instanceof Error ? err.message : 'Failed to update password';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Container withSafeArea>
      <AppBar 
        title="Update Password"
        showBackButton
        onBackPress={() => router.back()}
      />
      
      <View style={styles.content}>
        <Text style={styles.description}>
          Choose a strong password that is at least 8 characters long with a mix of letters, numbers, and symbols.
        </Text>
        
        {error && <ErrorMessage message={error} />}
        
        <FormField
          label="Current Password"
          value={formData.currentPassword}
          onChangeText={(value) => updateField('currentPassword', value)}
          secureTextEntry
          placeholder="Enter your current password"
          disabled={isLoading}
        />
        
        <PasswordInput
          label="New Password"
          value={formData.newPassword}
          onChangeText={(value) => updateField('newPassword', value)}
          placeholder="Enter your new password"
          disabled={isLoading}
        />
        
        <PasswordInput
          label="Confirm New Password"
          value={formData.confirmPassword}
          onChangeText={(value) => updateField('confirmPassword', value)}
          placeholder="Confirm your new password"
          disabled={isLoading}
        />
        
        <View style={styles.buttonContainer}>
          <Button
            title="Update Password"
            variant="primary"
            onPress={handleSubmit}
            loading={isLoading}
            disabled={isLoading}
          />
        </View>
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  description: {
    ...typography.body2,
    color: colors.mediumText,
    marginBottom: spacing.lg,
  },
  buttonContainer: {
    marginTop: spacing.xl,
  },
});