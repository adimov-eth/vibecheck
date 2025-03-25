import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { FormField } from "@/components/forms/FormField";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { colors, spacing, typography } from "@/constants/styles";
import { forgotPasswordVerificationSchema } from "@/validations/auth";
import { useSignUp } from "@clerk/clerk-expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function VerifyEmail() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { signUp, setActive } = useSignUp();

  // Form state
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate and submit form
  const handleSubmit = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Validate input
      const result = forgotPasswordVerificationSchema.safeParse({ code });
      if (!result.success) {
        setError(result.error.errors[0].message);
        return;
      }

      if (!signUp) {
        throw new Error("Sign up not available");
      }

      // Attempt to verify email
      const verificationResult = await signUp.attemptEmailAddressVerification({
        code,
      });

      // Handle verification response
      if (verificationResult.status === "complete" && verificationResult.createdSessionId) {
        // Set the active session
        await setActive({ session: verificationResult.createdSessionId });
        router.replace("/home");
      } else {
        throw new Error(`Email verification failed: ${verificationResult.status}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to verify email";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container withScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          Please enter the verification code sent to {email}
        </Text>
      </View>

      {error && <ErrorMessage message={error} />}

      <FormField
        label="Verification Code"
        value={code}
        onChangeText={setCode}
        placeholder="Enter verification code"
        keyboardType="numeric"
        autoCapitalize="none"
        disabled={isLoading}
        error={undefined}
      />

      <Button
        title="Verify Email"
        variant="primary"
        onPress={handleSubmit}
        loading={isLoading}
        disabled={isLoading || !code}
        style={styles.button}
      />
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.section,
    paddingBottom: spacing.section,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.heading1,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body1,
    color: colors.mediumText,
    textAlign: "center",
  },
  button: {
    marginTop: spacing.lg,
  },
});