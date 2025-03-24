import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { FormField } from "@/components/forms/FormField";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { colors, spacing, typography } from "@/constants/styles";
import { useForm } from "@/hooks/useForm";
import {
  forgotPasswordVerificationSchema,
  type ForgotPasswordVerificationData,
} from "@/validations/auth";
import { useSignUp } from "@clerk/clerk-expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function VerifyEmail() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { signUp, setActive } = useSignUp();

  const {
    values,
    errors,
    isLoading,
    generalError,
    updateField,
    handleSubmit,
  } = useForm<ForgotPasswordVerificationData>({
    initialValues: {
      code: "",
    },
    validationSchema: forgotPasswordVerificationSchema,
    onSubmit: async (values) => {
      if (!signUp) {
        throw new Error("Sign up not available");
      }

      try {
        // Attempt to verify email
        const result = await signUp.attemptEmailAddressVerification({
          code: values.code,
        });

        // Handle verification response
        if (result.status === "complete" && result.createdSessionId) {
          // Set the active session
          await setActive({ session: result.createdSessionId });
          router.replace("/home");
        } else {
          throw new Error(`Email verification failed: ${result.status}`);
        }
      } catch (err) {
        const error = err as Error;
        throw new Error(error.message || "Failed to verify email");
      }
    },
  });

  return (
    <Container withScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          Please enter the verification code sent to {email}
        </Text>
      </View>

      {generalError && <ErrorMessage message={generalError} />}

      <FormField
        label="Verification Code"
        value={values.code}
        onChangeText={(value) => updateField("code", value)}
        placeholder="Enter verification code"
        keyboardType="numeric"
        autoCapitalize="none"
        disabled={isLoading}
        error={errors.code}
      />

      <Button
        title="Verify Email"
        variant="primary"
        onPress={handleSubmit}
        loading={isLoading}
        disabled={isLoading || !values.code}
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