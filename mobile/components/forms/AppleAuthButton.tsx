import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect } from 'react';
import { colors, typography } from '@/constants/styles';

interface AppleAuthButtonProps {
  onSuccess: (token: string, userData?: { email?: string, fullName?: AppleAuthentication.AppleAuthenticationFullName }) => void;
  onError: (error: Error) => void;
  buttonText?: 'SIGN_IN' | 'CONTINUE' | 'SIGN_UP';
  title?: string;
  subtitle?: string;
}

export default function AppleAuthButton({ 
  onSuccess, 
  onError, 
  buttonText = 'SIGN_IN',
  title,
  subtitle
}: AppleAuthButtonProps) {
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);

  useEffect(() => {
    async function checkAvailability() {
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      setIsAppleAuthAvailable(isAvailable);
    }
    
    checkAvailability();
  }, []);

  const handleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      
      // Save user credentials
      if (credential.identityToken) {
        // Store the identity token which will be used for authentication with your server
        await SecureStore.setItemAsync('apple_identity_token', credential.identityToken);
        
        // Store the user ID for future credential state checks
        await SecureStore.setItemAsync('apple_user', credential.user);
        
        // Store user information if provided (usually only on first sign in)
        if (credential.fullName) {
          await SecureStore.setItemAsync('apple_user_fullname', JSON.stringify(credential.fullName));
        }
        
        if (credential.email) {
          await SecureStore.setItemAsync('apple_user_email', credential.email);
        }
        
        // Pass the identity token and user data to the parent component for authentication
        onSuccess(
          credential.identityToken, 
          { 
            email: credential.email,
            fullName: credential.fullName
          }
        );
      } else {
        onError(new Error('No identity token received from Apple'));
      }
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') {
        // User canceled the sign-in flow
        console.log('Sign in was canceled');
      } else {
        // Handle other errors
        onError(e);
      }
    }
  };

  if (!isAppleAuthAvailable) {
    return null;
  }

  // Determine button type from prop
  let buttonType;
  switch(buttonText) {
    case 'CONTINUE':
      buttonType = AppleAuthentication.AppleAuthenticationButtonType.CONTINUE;
      break;
    case 'SIGN_UP':
      buttonType = AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP;
      break;
    default:
      buttonType = AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN;
  }

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={buttonType}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={5}
        style={styles.button}
        onPress={handleSignIn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 10,
  },
  title: {
    ...typography.heading1,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body1,
    color: colors.mediumText,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    width: '100%',
    height: 48,
  },
});