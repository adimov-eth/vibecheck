import * as React from 'react'
import { Text, TextInput, View, StyleSheet } from 'react-native'
import { useSignUp } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import Button from '../../components/Button' 
import { colors, typography, spacing } from '../styles'

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp()
  const router = useRouter()

  const [emailAddress, setEmailAddress] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [pendingVerification, setPendingVerification] = React.useState(false)
  const [code, setCode] = React.useState('')

  const onSignUpPress = async () => {
    if (!isLoaded) return

    try {
      await signUp.create({
        emailAddress,
        password,
      })
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setPendingVerification(true)
    } catch (err) {
      console.error(JSON.stringify(err, null, 2))
    }
  }

  const onVerifyPress = async () => {
    if (!isLoaded) return

    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      })
      if (signUpAttempt.status === 'complete') {
        await setActive({ session: signUpAttempt.createdSessionId })
        router.replace('/')
      } else {
        console.error(JSON.stringify(signUpAttempt, null, 2))
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2))
    }
  }

  return (
    <View style={styles.container}>
      {pendingVerification ? (
        <>
          <Text style={styles.title}>Verify your email</Text>
          <TextInput
            style={styles.input}
            value={code}
            placeholder="Enter your verification code"
            onChangeText={setCode}
          />
          <Button title="Verify" onPress={onVerifyPress} variant="primary" />
        </>
      ) : (
        <>
          <Text style={styles.title}>Sign up</Text>
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
          <Button title="Continue" onPress={onSignUpPress} variant="primary" />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl, // 20
    backgroundColor: colors.background, // #FCFDFE
  },
  title: {
    ...typography.heading1, // Inter-Bold, 32px, centered
    color: colors.darkText, // #292D32
    marginBottom: spacing.md, // 12
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
})