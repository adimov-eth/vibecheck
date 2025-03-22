import { useUser } from '@clerk/clerk-expo'
import { useLocalCredentials } from '@clerk/clerk-expo/local-credentials'
import { View, Text, StyleSheet, SafeAreaView, Alert, TouchableOpacity, ScrollView } from 'react-native'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import AppBar from '../components/AppBar'
import Button from '../components/Button'
import { colors, typography, spacing, layout } from './styles'
import { TextInput } from 'react-native'

function Page() {
  const { user } = useUser()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')

  const { userOwnsCredentials, setCredentials } = useLocalCredentials()

  const validateForm = () => {
    if (!currentPassword.trim()) {
      setError('Current password is required')
      return false
    }
    if (!password.trim()) {
      setError('New password is required')
      return false
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return false
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const changePassword = async () => {
    if (!validateForm()) return

    setIsLoading(true)
    setError('')
    
    try {
      await user?.updatePassword({
        currentPassword: currentPassword,
        newPassword: password,
      })

      if (userOwnsCredentials) {
        await setCredentials({
          password,
        })
      }
      
      Alert.alert(
        'Success', 
        'Your password has been updated successfully', 
        [{ text: 'OK', onPress: () => router.back() }]
      )
      
      // Reset form
      setCurrentPassword('')
      setPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      console.error(JSON.stringify(err, null, 2))
      setError(err.message || 'Failed to update password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackPress = () => {
    // Navigate back to the user profile screen
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/user')
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppBar 
        title="Update Password"
        showBackButton={true}
        onBackPress={handleBackPress}
        showAvatar={false}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.card}>
          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          
          <Text style={styles.label}>Current Password</Text>
          <View style={styles.inputContainer}>
            <TextInput
              autoCapitalize="none"
              value={currentPassword}
              placeholder="Enter current password"
              secureTextEntry={!showCurrentPassword}
              onChangeText={setCurrentPassword}
              style={styles.input}
            />
            <TouchableOpacity 
              onPress={() => setShowCurrentPassword(!showCurrentPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons name={showCurrentPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.mediumText} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputContainer}>
            <TextInput
              autoCapitalize="none"
              value={password}
              placeholder="Enter new password"
              secureTextEntry={!showNewPassword}
              onChangeText={setPassword}
              style={styles.input}
            />
            <TouchableOpacity 
              onPress={() => setShowNewPassword(!showNewPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.mediumText} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.label}>Confirm New Password</Text>
          <View style={styles.inputContainer}>
            <TextInput
              autoCapitalize="none"
              value={confirmPassword}
              placeholder="Confirm new password"
              secureTextEntry={!showConfirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.input}
            />
            <TouchableOpacity 
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.mediumText} />
            </TouchableOpacity>
          </View>
          
          <Button 
            title="Update Password" 
            onPress={changePassword}
            loading={isLoading}
            style={styles.updateButton}
            icon={<Ionicons name="lock-closed-outline" size={20} color={colors.white} />}
          />
        </View>
        
        <Text style={styles.passwordHint}>
          Password must be at least 8 characters and contain a mix of letters, numbers, and special characters for best security.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

export default Page

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
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: layout.borderRadius.medium,
    padding: spacing.lg,
    ...layout.cardShadow,
  },
  label: {
    ...typography.body2,
    fontWeight: '600',
    color: colors.darkText,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.borderRadius.small,
    backgroundColor: colors.white,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: spacing.md,
    ...typography.body1,
  },
  eyeIcon: {
    padding: spacing.md,
  },
  updateButton: {
    marginTop: spacing.lg,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 77, 79, 0.1)',
    borderRadius: layout.borderRadius.small,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.body2,
    color: colors.error,
    marginLeft: spacing.xs,
  },
  passwordHint: {
    ...typography.body3,
    color: colors.lightText,
    textAlign: 'center',
    marginTop: spacing.lg,
    padding: spacing.md,
  },
})