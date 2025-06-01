import { colors, typography } from "@/constants/styles";
import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface AppleAuthButtonProps {
	onSuccess: (
		identityToken: string,
		userData: {
			userIdentifier: string;
			email?: string | null;
			fullName?: AppleAuthentication.AppleAuthenticationFullName | null;
		},
	) => void;
	onError: (error: Error) => void;
	buttonText?: "SIGN_IN" | "CONTINUE" | "SIGN_UP";
	title?: string;
	subtitle?: string;
}

export const AppleAuthButton = ({
	onSuccess,
	onError,
	buttonText = "SIGN_IN",
	title,
	subtitle,
}: AppleAuthButtonProps) => {
	const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);

	useEffect(() => {
		async function checkAvailability() {
			const isAvailable = await AppleAuthentication.isAvailableAsync();
			setIsAppleAuthAvailable(isAvailable);
		}

		checkAvailability();
	}, []);

	const handleSignIn = async () => {
		try {
			const credential = await AppleAuthentication.signInAsync({
				requestedScopes: [
					AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
					AppleAuthentication.AppleAuthenticationScope.EMAIL,
				],
			});

			if (credential.identityToken) {
				// Pass the identity token and user data to the parent component
				onSuccess(credential.identityToken, {
					userIdentifier: credential.user,
					email: credential.email,
					fullName: credential.fullName,
				});
			} else {
				onError(new Error("No identity token received from Apple"));
			}
		} catch (e: unknown) {
			if (
				e instanceof Error &&
				"code" in e &&
				e.code === "ERR_REQUEST_CANCELED"
			) {
				// User canceled the sign-in flow
				console.log("Sign in was canceled");
			} else {
				// Handle other errors
				onError(e as Error);
			}
		}
	};

	if (!isAppleAuthAvailable) {
		return null;
	}

	// Determine button type from prop
	let buttonType: AppleAuthentication.AppleAuthenticationButtonType;
	switch (buttonText) {
		case "CONTINUE":
			buttonType = AppleAuthentication.AppleAuthenticationButtonType.CONTINUE;
			break;
		case "SIGN_UP":
			buttonType = AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP;
			break;
		default:
			buttonType = AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN;
	}

	return (
		<View style={styles.container}>
			{title && <Text style={styles.title}>{title}</Text>}
			{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

			<AppleAuthentication.AppleAuthenticationButton
				buttonType={buttonType}
				buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
				cornerRadius={5}
				style={styles.button}
				onPress={handleSignIn}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		width: "100%",
		alignItems: "center",
		marginVertical: 10,
	},
	title: {
		...typography.heading1,
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		...typography.body2,
		textAlign: "center",
		color: colors.text.secondary,
		marginBottom: 24,
	},
	button: {
		width: "100%",
		height: 48,
	},
});

export default AppleAuthButton;
