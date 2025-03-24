import { ErrorMessage } from "@/components/feedback/ErrorMessage";
import { FormField } from "@/components/forms/FormField";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { colors, spacing, typography } from "@/constants/styles";
import { useForm } from "@/hooks/useForm";
import { signUpSchema, type SignUpFormData } from "@/validations/auth";
import { useSignUp } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function SignUp() {
  const router = useRouter();
  const { signUp, setActive } = useSignUp();

  const {
    values,
    errors,
    isLoading,
    generalError,
    updateField,
    handleSubmit,
  } = useForm<SignUpFormData>({
    initialValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
    validationSchema: signUpSchema,
    onSubmit: async (values) => {
      if (!signUp) {
        throw new Error("Sign up not available");
      }

      try {
        // Attempt to sign up
        const result = await signUp.create({
          emailAddress: values.email,
          password: values.password,
        });

        // Handle sign up response
        if (result.status === "complete") {
          // Set the active session
          await setActive({ session: result.createdSessionId });
          router.replace("/home");
        } else if (result.status === "missing_requirements") {
          // Email verification needed
          router.push({
            pathname: "/verify-email",
            params: { email: values.email },
          });
        } else {
          throw new Error(`Sign up failed: ${result.status}`);
        }
      } catch (err) {
        const error = err as Error;
        throw new Error(error.message || "Failed to sign up");
      }
    },
  });

  return (
    <Container withScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Sign up to get started</Text>
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

      <PasswordInput
        label="Password"
        value={values.password}
        onChangeText={(value) => updateField("password", value)}
        placeholder="Create a password"
        disabled={isLoading}
        error={errors.password}
      />

      <View style={styles.confirmPasswordContainer}>
        <PasswordInput
          label="Confirm Password"
          value={values.confirmPassword}
          onChangeText={(value) => updateField("confirmPassword", value)}
          placeholder="Confirm your password"
          disabled={isLoading}
          error={errors.confirmPassword}
        />
      </View>

      <Button
        title="Sign Up"
        variant="primary"
        onPress={handleSubmit}
        loading={isLoading}
        disabled={
          isLoading ||
          !values.email ||
          !values.password ||
          !values.confirmPassword
        }
        style={styles.button}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Link href="/(auth)/sign-in" style={styles.signInLink}>
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