import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { FormField } from "@/components/forms/FormField";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { colors, spacing, typography } from "@/constants/styles";
import { useForm } from "@/hooks/useForm";
import { signInSchema, type SignInFormData } from "@/validations/auth";
import { useSignIn } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function SignIn() {
  const router = useRouter();
  const { signIn, setActive } = useSignIn();

  const {
    values,
    errors,
    isLoading,
    generalError,
    updateField,
    handleSubmit,
  } = useForm<SignInFormData>({
    initialValues: {
      email: "",
      password: "",
    },
    validationSchema: signInSchema,
    onSubmit: async (values) => {
      if (!signIn) {
        throw new Error("Sign in not available");
      }

      try {
        // Attempt to sign in
        const result = await signIn.create({
          identifier: values.email,
          password: values.password,
        });

        // Handle sign in response
        if (result.status === "complete") {
          // Set the active session
          await setActive({ session: result.createdSessionId });
          router.replace("/home");
        } else {
          throw new Error(`Sign in failed: ${result.status}`);
        }
      } catch (err) {
        const error = err as Error;
        throw new Error(error.message || "Failed to sign in");
      }
    },
  });

  return (
    <Container withScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to your account</Text>
      </View>

      {generalError && <ErrorMessage message={generalError} />}

      <FormField
        label="Email"
        value={values.email}
        onChangeText={(value) => updateField("email", value)}
        placeholder="Enter your email"
        keyboardType="email-address"
        autoCapitalize="none"
        disabled={isLoading}
        error={errors.email}
      />

      <View style={styles.passwordContainer}>
        <PasswordInput
          label="Password"
          value={values.password}
          onChangeText={(value) => updateField("password", value)}
          placeholder="Enter your password"
          disabled={isLoading}
          error={errors.password}
        />

        <Link href="/(auth)/forgot-password" style={styles.forgotPasswordLink}>
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </Link>
      </View>

      <Button
        title="Sign In"
        variant="primary"
        onPress={handleSubmit}
        loading={isLoading}
        disabled={isLoading || !values.email || !values.password}
        style={styles.button}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don&apos;t have an account?</Text>
        <Link href="/(auth)/sign-up" style={styles.signUpLink}>
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