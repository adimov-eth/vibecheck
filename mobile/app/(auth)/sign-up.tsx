import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { FormField } from "@/components/forms/FormField";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toast";
import { colors, spacing, typography } from "@/constants/styles";
import { signUpSchema, type SignUpFormData } from "@/validations/auth";
import { useSignUp } from "@clerk/clerk-expo";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { StyleSheet, Text, View } from "react-native";

export default function SignUp() {
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit: SubmitHandler<SignUpFormData> = async (data) => {
    if (!isLoaded || !signUp) return;
    setError(null);

    try {
      // Start the sign-up process using email and password
      const signUpAttempt = await signUp.create({
        emailAddress: data.email,
        password: data.password,
      });

      // Handle sign up response
      if (signUpAttempt.status === "complete") {
        // Set the active session
        await setActive({ session: signUpAttempt.createdSessionId });
        showToast.success("Success", "Account created successfully");
        router.replace("../home");
      } else if (signUpAttempt.status === "missing_requirements") {
        // Log the full response for debugging
        console.log("Sign up requirements:", JSON.stringify(signUpAttempt, null, 2));
        
        // Check if email verification is specifically required
        const needsEmailVerification = signUpAttempt.verifications?.emailAddress?.status !== "verified";
        
        if (needsEmailVerification) {
          showToast.info("Verification Required", "Please verify your email address");
          router.push({
            pathname: "/(auth)/verify-email",
            params: { email: data.email },
          });
        } else {
          // If no email verification needed, try to complete the sign up
          try {
            await signUpAttempt.prepareEmailAddressVerification();
            await setActive({ session: signUpAttempt.createdSessionId });
            showToast.success("Success", "Account created successfully");
            router.replace("../home");
          } catch (verificationErr) {
            console.error("Verification error:", verificationErr);
            throw new Error("Failed to complete sign up process");
          }
        }
      } else {
        // User needs to complete additional steps
        console.error("Sign up incomplete:", JSON.stringify(signUpAttempt, null, 2));
        throw new Error(`Sign up failed: ${signUpAttempt.status}`);
      }
    } catch (err) {
      console.error("Sign up failed:", err);
      const errorMsg = err instanceof Error ? 
        err.message : "Failed to create account. Please try again.";
      setError(errorMsg);
      showToast.error("Error", errorMsg);
    }
  };

  return (
    <Container withScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Sign up to get started</Text>
      </View>

      {error && <ErrorMessage message={error} testID="auth-error" />}

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
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <PasswordInput
            label="Password"
            value={value}
            onChangeText={onChange}
            placeholder="Create a password"
            disabled={isSubmitting || !isLoaded}
            error={errors.password?.message}
          />
        )}
      />

      <View style={styles.confirmPasswordContainer}>
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value } }) => (
            <PasswordInput
              label="Confirm Password"
              value={value}
              onChangeText={onChange}
              placeholder="Confirm your password"
              disabled={isSubmitting || !isLoaded}
              error={errors.confirmPassword?.message}
            />
          )}
        />
      </View>

      <Button
        title="Sign Up"
        variant="primary"
        onPress={handleSubmit(onSubmit)}
        loading={isSubmitting || !isLoaded}
        disabled={isSubmitting || !isLoaded}
        style={styles.button}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Link href="./sign-in" style={styles.signInLink}>
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
  subtitle: {
    ...typography.body1,
    color: colors.mediumText,
    textAlign: "center",
  },
  confirmPasswordContainer: {
    marginBottom: spacing.lg,
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
  signInLink: {
    marginLeft: spacing.xs,
  },
  signInText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: "600",
  },
});