import { getAuthTokens } from '@/utils/auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type React from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface AppBarProps {
  title?: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  showAvatar?: boolean;
  onAvatarPress?: () => void;
  testID?: string;
}

interface UserInfo {
  email?: string | null;
  fullName?: {
    givenName?: string | null;
    familyName?: string | null;
  };
}

export const AppBar: React.FC<AppBarProps> = ({ 
  title = "VibeCheck",
  showBackButton = false,
  onBackPress,
  showAvatar = true,
  onAvatarPress,
  testID,
}) => {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    const loadUserInfo = async () => {
      const tokens = await getAuthTokens();
      if (tokens.email || (tokens.fullName?.givenName || tokens.fullName?.familyName)) {
        setUserInfo({
          email: tokens.email || undefined,
          fullName: tokens.fullName ? {
            givenName: tokens.fullName.givenName || undefined,
            familyName: tokens.fullName.familyName || undefined
          } : undefined
        });
      }
    };
    loadUserInfo();
  }, []);

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  const handleAvatarPress = () => {
    if (onAvatarPress) {
      onAvatarPress();
    } else {
      router.push('/profile');
    }
  };

  const getUserInitial = () => {
    if (userInfo?.fullName?.givenName) {
      return userInfo.fullName.givenName[0].toUpperCase();
    }if (userInfo?.email) {
      return userInfo.email[0].toUpperCase();
    }
    return '?';
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.leftContainer}>
        {showBackButton && (
          <TouchableOpacity 
            onPress={handleBackPress} 
            style={styles.backButton}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.centerContainer}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <View style={styles.rightContainer}>
        {showAvatar && (
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={handleAvatarPress}
            activeOpacity={0.7}
            accessibilityLabel="User profile"
            accessibilityRole="button"
          >
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{getUserInitial()}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  leftContainer: {
    width: 40,
    alignItems: 'flex-start',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
  },
  rightContainer: {
    width: 40,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  backButton: {
    padding: 4,
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  avatarInitial: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 