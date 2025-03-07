import { useUser, useClerk } from '@clerk/clerk-expo'
import { useLocalCredentials } from '@clerk/clerk-expo/local-credentials'
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import AppBar from '../components/AppBar'
import Button from '../components/Button'
import { colors, typography, spacing, layout } from './styles'

export default function Page() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const [isLoading, setIsLoading] = useState(false)
  
  const { userOwnsCredentials, clearCredentials } = useLocalCredentials()

  const handleSignOut = async () => {
    setIsLoading(true)
    try {
      await signOut()
      // After signing out, navigate to the auth screen or home
      router.replace('/')
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out. Please try again.')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearCredentials = async () => {
    setIsLoading(true)
    try {
      await clearCredentials()
      Alert.alert('Success', 'Biometric credentials removed successfully.')
    } catch (error) {
      Alert.alert('Error', 'Failed to remove biometric credentials. Please try again.')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const navigateToUpdatePassword = () => {
    router.push('/update-user')
  }

  const handleBackPress = () => {
    // Check if we can go back, otherwise go to home
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/(home)')
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppBar 
        title="Profile"
        showBackButton={true}
        onBackPress={handleBackPress}
        showAvatar={false}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{user?.firstName?.[0] || user?.emailAddresses[0].emailAddress?.[0] || '?'}</Text>
          </View>
          <Text style={styles.userName}>{user?.firstName || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.emailAddresses[0].emailAddress}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          
          <View style={styles.card}>
            <Button 
              title="Update Password" 
              onPress={navigateToUpdatePassword}
              variant="outline"
              icon={<Ionicons name="lock-closed-outline" size={20} color={colors.primary} />}
              style={styles.button}
            />
            
            <Button 
              title="Sign Out" 
              onPress={handleSignOut}
              variant="primary"
              loading={isLoading}
              icon={<Ionicons name="log-out-outline" size={20} color={colors.white} />}
              style={styles.button}
            />
            
            {userOwnsCredentials && (
              <Button 
                title="Remove Biometric Login" 
                onPress={handleClearCredentials}
                variant="outline"
                loading={isLoading}
                icon={<Ionicons name="finger-print-outline" size={20} color={colors.primary} />}
                style={styles.button}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  profileHeader: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    ...layout.cardShadow,
  },
  avatarText: {
    fontSize: 32,
    color: colors.white,
    fontFamily: 'Inter-Bold',
  },
  userName: {
    ...typography.heading2,
    marginBottom: spacing.xs,
  },
  userEmail: {
    ...typography.body1,
    color: colors.mediumText,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.heading3,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: layout.borderRadius.medium,
    padding: spacing.lg,
    ...layout.cardShadow,
  },
  button: {
    marginBottom: spacing.md,
  },
})