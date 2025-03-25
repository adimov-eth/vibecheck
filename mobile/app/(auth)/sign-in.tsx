import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { FormField } from "@/components/forms/FormField";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toast";
import { colors, spacing, typography } from "@/constants/styles";
import { signInSchema, type SignInFormData } from "@/validations/auth";
import { useSignIn } from "@clerk/clerk-expo";
import { isClerkAPIResponseError, isClerkRuntimeError } from "@clerk/clerk-js";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { StyleSheet, Text, View } from "react-native";

export default function SignIn() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<SignInFormData> = async (data) => {
    if (!isLoaded || !signIn) return;
    setError(null);

    try {
      // Start the sign-in process using email and password
      const signInAttempt = await signIn.create({
        identifier: data.email,
        password: data.password,
      });

      // Handle sign in response
      if (signInAttempt.status === "complete") {
        // Set the active session
        await setActive({ session: signInAttempt.createdSessionId });
        showToast.success("Success", "Signed in successfully");
        router.replace("../home");
      } else if (signInAttempt.status === "needs_second_factor") {
        // Handle 2FA if needed
        setError("Two-factor authentication is required");
        // TODO: Implement 2FA flow
      } else if (!signInAttempt.status) {
        throw new Error("Unable to complete sign in. Please check your network connection and try again.");
      } else {
        throw new Error(`Sign in could not be completed: ${signInAttempt.status}`);
      }
    } catch (err) {
      console.error("Sign in failed:", err);
      
      let errorMessage = "An unexpected error occurred. Please try again.";
      
      if (isClerkRuntimeError(err)) {
        if (err.code === "network_error") {
          errorMessage = "Network connection error. Please check your internet connection and try again.";
        } else {
          errorMessage = err.message;
        }
      } else if (isClerkAPIResponseError(err)) {
        errorMessage = err.errors[0]?.longMessage || err.errors[0]?.message || "Authentication failed. Please try again.";
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      showToast.error("Error", errorMessage);
    }
  };

  return (
    <Container withScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to your account</Text>
      </View>

      {error && (
        <ErrorMessage 
          message={error} 
          testID="auth-error"
        />
      )}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <FormField
            label="Email"
            value={value}
            onChangeText={onChange}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            disabled={isSubmitting || !isLoaded}
            error={errors.email?.message}
            testID="email-input"
          />
        )}
      />

      <View style={styles.passwordContainer}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <PasswordInput
              label="Password"
              value={value}
              onChangeText={onChange}
              placeholder="Enter your password"
              disabled={isSubmitting || !isLoaded}
              error={errors.password?.message}
              testID="password-input"
            />
          )}
        />

        <Link href="./forgot-password" style={styles.forgotPasswordLink}>
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </Link>
      </View>

      <Button
        title="Sign In"
        variant="primary"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting || !isLoaded}
        disabled={isSubmitting || !isLoaded}
        style={styles.button}
        testID="sign-in-button"
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don&apos;t have an account?</Text>
        <Link href="./sign-up" style={styles.signUpLink}>
          <Text style={styles.signUpText}>Sign up</Text>
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
  subtitle: {
    ...typography.body1,
    color: colors.mediumText,
    textAlign: "center",
  },
  errorMessage: {
    marginBottom: spacing.md,
  },
  passwordContainer: {
    marginBottom: spacing.lg,
  },
  forgotPasswordLink: {
    alignSelf: "flex-end",
    marginTop: spacing.xs,
  },
  forgotPasswordText: {
    ...typography.body2,
    color: colors.primary,
  },
  button: {
    marginTop: spacing.md,
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
  signUpLink: {
    marginLeft: spacing.xs,
  },
  signUpText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: "600",
  },
});