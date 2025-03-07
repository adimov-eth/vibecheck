import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, typography, spacing, layout } from '../app/styles';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';

interface AppBarProps {
  showBackButton?: boolean;
  onBackPress?: () => void;
  title?: string; 
  showAvatar?: boolean;
  onAvatarPress?: () => void;
}

const AppBar = ({ 
  showBackButton = false, 
  onBackPress, 
  title = "VibeCheck",
  showAvatar = true,
  onAvatarPress
}: AppBarProps) => {
  const router = useRouter();
  const { user } = useUser();
  
  const handleAvatarPress = () => {
    if (onAvatarPress) {
      onAvatarPress();
    } else {
      // Default behavior is to navigate to the user profile screen
      router.push('/user');
    }
  };
  
  // Get user's initials for avatar
  const getUserInitial = () => {
    if (user?.firstName) {
      return user.firstName[0].toUpperCase();
    } else if (user?.emailAddresses && user.emailAddresses[0]) {
      return user.emailAddresses[0].emailAddress[0].toUpperCase();
    }
    return '?';
  };

  // Get user's profile image if available
  const hasProfileImage = user?.imageUrl ? true : false;
  
  return (
    <View style={styles.container}>
      <View style={styles.leftContainer}>
        {showBackButton && (
          <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.darkText} />
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.centerContainer}>
        <Text style={styles.title}>{title}</Text>
      </View>
      
      <View style={styles.rightContainer}>
        {showAvatar && (
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={handleAvatarPress}
            activeOpacity={0.7}
          >
            {hasProfileImage ? (
              <Image 
                source={{ uri: user?.imageUrl }} 
                style={styles.avatarImage} 
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{getUserInitial()}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
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
    ...typography.heading3,
    color: colors.darkText,
  },
  backButton: {
    padding: 4,
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    ...layout.cardShadow,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary,
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
    color: colors.white,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});

export default AppBar;