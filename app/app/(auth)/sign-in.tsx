import { useSignIn } from '@clerk/clerk-expo'
import { Link, useRouter } from 'expo-router'
import { Text, TextInput, View, StyleSheet } from 'react-native'
import { useState } from 'react'
import { useLocalCredentials } from '@clerk/clerk-expo/local-credentials'
import Button from '../../components/Button' 
import { colors, typography, spacing } from '../styles'

export default function Page() {
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()
  const { hasCredentials, setCredentials, authenticate, biometricType } = useLocalCredentials()

  const [emailAddress, setEmailAddress] = useState('')
  const [password, setPassword] = useState('')

  const onSignInPress = async (useLocal: boolean) => {
    if (!isLoaded) return

    try {
      const signInAttempt =
        hasCredentials && useLocal
          ? await authenticate()
          : await signIn.create({
              identifier: emailAddress,
              password,
            })

      if (signInAttempt.status === 'complete') {
        if (!useLocal) {
          await setCredentials({
            identifier: emailAddress,
            password,
          })
        }
        await setActive({ session: signInAttempt.createdSessionId })
        router.replace('/')
      } else {
        console.error(JSON.stringify(signInAttempt, null, 2))
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2))
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={emailAddress}
        placeholder="Enter email"
        onChangeText={setEmailAddress}
      />
      <TextInput
        style={styles.input}
        value={password}
        placeholder="Enter password"
        secureTextEntry={true}
        onChangeText={setPassword}
      />
      <Button title="Sign In" onPress={() => onSignInPress(false)} variant="primary" />
      {hasCredentials && biometricType && (
        <Button
          title={biometricType === 'face-recognition' ? 'Sign in with Face ID' : 'Sign in with Touch ID'}
          onPress={() => onSignInPress(true)}
          variant="secondary"
        />
      )}
      <View style={styles.linkContainer}>
        <Text>Don't have an account?</Text>
        <Link href="/sign-up">
          <Text style={styles.linkText}>Sign up</Text>
        </Link>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl, // 20
    backgroundColor: colors.background, // #FCFDFE
  },
  input: {
    ...typography.body1, // Inter-Regular, 16px
    color: colors.darkText, // #292D32
    backgroundColor: colors.white, // #FFFFFF
    borderWidth: 1,
    borderColor: colors.border, // #E3E9EE
    borderRadius: 8,
    padding: spacing.md, // 12
    marginBottom: spacing.md, // 12
  },
  linkContainer: {
    marginTop: spacing.md, // 12
    alignItems: 'center',
  },
  linkText: {
    color: colors.primary, // #2566FE
    ...typography.buttonText, // Inter-SemiBold, 14px
  },
})