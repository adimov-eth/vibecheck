import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { FormField } from "@/components/forms/FormField";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toast";
import { colors, spacing, typography } from "@/constants/styles";
import { useSignIn } from "@clerk/clerk-expo";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { StyleSheet, Text, View } from "react-native";
import { z } from "zod";

const resetSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const verifySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  code: z.string().min(6, "Verification code must be 6 digits"),
});

type ResetFormData = z.infer<typeof resetSchema>;
type VerifyFormData = z.infer<typeof verifySchema>;

export default function ForgotPassword() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const [successfulCreation, setSuccessfulCreation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control: resetControl,
    handleSubmit: handleResetSubmit,
    formState: { errors: resetErrors, isSubmitting: isResetting },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      email: "",
    },
  });

  const {
    control: verifyControl,
    handleSubmit: handleVerifySubmit,
    formState: { errors: verifyErrors, isSubmitting: isVerifying },
  } = useForm<VerifyFormData>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      password: "",
      code: "",
    },
  });

  const onRequestCode: SubmitHandler<ResetFormData> = async (data) => {
    if (!isLoaded || !signIn) return;
    setError(null);

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: data.email,
      });
      setSuccessfulCreation(true);
      showToast.success("Reset code sent", "Please check your email for the reset code");
    } catch (err) {
      console.error("Reset code request failed:", err);
      const errorMsg = err instanceof Error ? 
        err.message : "Failed to send reset code. Please try again.";
      setError(errorMsg);
      showToast.error("Error", errorMsg);
    }
  };

  const onVerifyCode: SubmitHandler<VerifyFormData> = async (data) => {
    if (!isLoaded || !signIn) return;
    setError(null);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: data.code,
        password: data.password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        showToast.success("Success", "Password reset successful");
        router.replace("/home" as any);
      } else {
        throw new Error(`Verification failed: ${result.status}`);
      }
    } catch (err) {
      console.error("Password reset failed:", err);
      const errorMsg = err instanceof Error ? 
        err.message : "Failed to reset password. Please try again.";
      setError(errorMsg);
      showToast.error("Error", errorMsg);
    }
  };

  return (
    <Container withScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Forgot Password?</Text>
      </View>

      {error && <ErrorMessage message={error} testID="auth-error" />}

      {!successfulCreation ? (
        <>
          <Controller
            control={resetControl}
            name="email"
            render={({ field: { onChange, value } }) => (
              <FormField
                label="Provide your email address"
                value={value}
                onChangeText={onChange}
                placeholder="e.g john@doe.com"
                keyboardType="email-address"
                autoCapitalize="none"
                disabled={isResetting || !isLoaded}
                error={resetErrors.email?.message}
              />
            )}
          />

          <Button
            title="Send password reset code"
            variant="primary"
            onPress={handleResetSubmit(onRequestCode)}
            loading={isResetting || !isLoaded}
            disabled={isResetting || !isLoaded}
            style={styles.button}
          />
        </>
      ) : (
        <>
          <Controller
            control={verifyControl}
            name="password"
            render={({ field: { onChange, value } }) => (
              <PasswordInput
                label="Enter your new password"
                value={value}
                onChangeText={onChange}
                placeholder="Create a new password"
                disabled={isVerifying || !isLoaded}
                error={verifyErrors.password?.message}
              />
            )}
          />

          <Controller
            control={verifyControl}
            name="code"
            render={({ field: { onChange, value } }) => (
              <FormField
                label="Enter the password reset code that was sent to your email"
                value={value}
                onChangeText={onChange}
                placeholder="Enter verification code"
                keyboardType="numeric"
                disabled={isVerifying || !isLoaded}
                error={verifyErrors.code?.message}
              />
            )}
          />

          <Button
            title="Reset Password"
            variant="primary"
            onPress={handleVerifySubmit(onVerifyCode)}
            loading={isVerifying || !isLoaded}
            disabled={isVerifying || !isLoaded}
            style={styles.button}
          />
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Remember your password?</Text>
        <Link href={"/sign-in" as any} style={styles.signInLink}>
          <Text style={styles.signInText}>Sign in</Text>
        </Link>
      </View>
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
  button: {
    marginTop: spacing.lg,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.body2,
    color: colors.mediumText,
  },
  signInLink: {
    marginLeft: spacing.xs,
  },
  signInText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: "600",
  },
});