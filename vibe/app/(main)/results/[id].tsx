import { ResultsView } from "@/components/conversation/ResultsView";
import { AppBar } from "@/components/layout/AppBar";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { colors, spacing, typography } from "@/constants/styles";
// Removed useConversation import, now handled within useConversationResult
import { useConversationResult } from "@/hooks/useConversationResult";
import useStore from "@/state"; // Import useStore
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

// Define the possible statuses more explicitly
type ResultStatus = "uploading" | "processing" | "completed" | "error";

export default function Results() {
	const { id } = useLocalSearchParams();
	const router = useRouter();
	const conversationId = id as string; // This is the SERVER ID

	// --- Hooks ---
	// useConversationResult now fetches both WS data and REST data
	const resultHook = useConversationResult(conversationId);
	const resultDataWs = resultHook?.data; // Data from WebSocket (transcript, analysis, status)
	const conversationDataRest = resultHook?.conversationData; // Data from REST API
	const isHookLoading = resultHook?.isLoading ?? true; // Combined loading state from hook
	const hookError = resultHook?.error; // Combined error from hook

	// Get upload status from store
	const uploadProgressMap = useStore((state) => state.uploadProgress);
	const uploadResultsMap = useStore((state) => state.uploadResults);

	// --- State Calculation ---

	// Determine required upload keys based on conversation mode (fallback to 'live' if loading)
	const requiredUploadKeys = useMemo(() => {
		// Use REST data for recordingType if available, otherwise default
		if (conversationDataRest?.recordingType === "separate") return ["1", "2"];
		return ["live"];
	}, [conversationDataRest?.recordingType]);

	// Calculate overall upload progress and status
	const uploadStatus = useMemo(() => {
		let totalProgress = 0;
		let completedCount = 0;
		let failed = false;
		let errorMessage: string | undefined;

		if (!conversationId)
			return { progress: 0, completed: false, failed: false };

		for (const key of requiredUploadKeys) {
			const uploadId = `${conversationId}_${key}`;
			const progress = uploadProgressMap[uploadId];
			const result = uploadResultsMap[uploadId];

			if (result?.success) {
				totalProgress += 100;
				completedCount++;
			} else if (result?.error) {
				failed = true;
				errorMessage = result.error;
				break; // Stop checking if one fails
			} else if (progress !== undefined && progress >= 0) {
				totalProgress += progress; // Add current progress if upload is ongoing
			} else {
				// No result, no progress -> assume 0% for this key
			}
		}

		const overallProgress =
			requiredUploadKeys.length > 0
				? Math.round(totalProgress / requiredUploadKeys.length)
				: 0;
		const allUploadsComplete = completedCount === requiredUploadKeys.length;

		return {
			progress: overallProgress,
			completed: allUploadsComplete && !failed,
			failed: failed,
			error: errorMessage,
		};
	}, [conversationId, requiredUploadKeys, uploadProgressMap, uploadResultsMap]);

	// Determine overall status and error, considering REST and WS states
	const finalStatus: ResultStatus = useMemo(() => {
		if (uploadStatus.failed) return "error";
		if (!uploadStatus.completed) return "uploading";
		if (hookError) return "error"; // Combined error from hook
		if (resultDataWs?.status === "error") return "error"; // WS data indicates error
		if (conversationDataRest?.status === "error") return "error"; // REST data indicates error

		// If REST says completed, trust it even if WS hasn't updated yet
		if (conversationDataRest?.status === "completed") return "completed";
		// If WS says completed, trust it
		if (resultDataWs?.status === "completed") return "completed";

		// If uploads are done, and no errors reported, assume processing
		return "processing";
	}, [uploadStatus, resultDataWs, conversationDataRest, hookError]);

	const finalError: string | null = useMemo(() => {
		if (uploadStatus.failed) return uploadStatus.error || "Upload failed";
		if (hookError) return hookError; // Use combined error from hook
		// No need to check individual WS/REST errors here, hookError covers them
		return null;
	}, [uploadStatus, hookError]);

	// Calculate progress based on the current status
	const finalProgress: number = useMemo(() => {
		if (finalStatus === "completed") return 100;
		if (finalStatus === "error") return 100; // Show 100% on error? Or last known? Let's use 100.
		if (finalStatus === "uploading") return uploadStatus.progress;
		if (finalStatus === "processing") {
			// Use WS progress if available, otherwise estimate based on upload completion
			return resultDataWs?.progress ?? (uploadStatus.completed ? 50 : 0); // Start at 50 if uploads done but no WS progress yet
		}
		return 0;
	}, [
		finalStatus,
		uploadStatus.progress,
		uploadStatus.completed,
		resultDataWs?.progress,
	]);

	// --- Handlers ---
	const handleGoToHome = React.useCallback(() => {
		router.replace("../home");
	}, [router]);

	const handleRetry = () => {
		if (uploadStatus.failed) {
			for (const key of requiredUploadKeys) {
				const uploadId = `${conversationId}_${key}`;
				const result = uploadResultsMap[uploadId];
				if (result?.error) {
					console.log(`[ResultsScreen] Retrying failed upload: ${uploadId}`);
					useStore.getState().retryUpload(uploadId);
					break; // Retry one at a time
				}
			}
		} else if (hookError) {
			// Check combined error
			console.log(
				`[ResultsScreen] Retrying WebSocket connection/fetch for: ${conversationId}`,
			);
			resultHook?.refetch?.(); // Call refetch from the hook
		}
		// Removed conversationError check as it's part of hookError
	};

	// --- UI ---
	const accentColor = React.useMemo(() => {
		// Use default color if conversation data is still loading
		if (isHookLoading && !conversationDataRest) return colors.primary;
		// Use REST data for mode if available
		return conversationDataRest?.mode === "mediator"
			? "#58BD7D"
			: conversationDataRest?.mode === "counselor"
				? "#3B71FE"
				: colors.primary;
	}, [conversationDataRest?.mode, isHookLoading, conversationDataRest]);

	// Loading/Error States
	if (!conversationId) {
		return (
			<Container withSafeArea>
				<AppBar title="Error" showBackButton onBackPress={handleGoToHome} />
				<View style={styles.centeredMessageContainer}>
					<Text style={styles.errorTitle}>Missing ID</Text>
					<Text style={styles.errorMessage}>
						Cannot load results without a conversation ID.
					</Text>
					<Button title="Go Home" onPress={handleGoToHome} variant="primary" />
				</View>
			</Container>
		);
	}

	// Render ResultsView - it will handle displaying loading/error/completed internally
	return (
		<Container withSafeArea>
			<AppBar title="Results" showBackButton onBackPress={handleGoToHome} />
			<View style={{ flex: 1 }}>
				<ResultsView
					status={finalStatus} // Pass the calculated status
					resultDataWs={resultDataWs} // Pass the raw result data from WS
					conversationDataRest={conversationDataRest} // Pass conversation data from REST
					error={finalError} // Pass combined error string
					progress={finalProgress} // Pass calculated progress
					accentColor={accentColor}
					onNewConversation={handleGoToHome}
					onRetry={finalStatus === "error" ? handleRetry : undefined} // Only show retry if status is error
				/>
			</View>
		</Container>
	);
}

const styles = StyleSheet.create({
	centeredMessageContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: spacing.xl,
	},
	errorTitle: {
		...typography.heading2,
		marginBottom: spacing.md,
		textAlign: "center",
	},
	errorMessage: {
		...typography.body1,
		marginBottom: spacing.xl,
		textAlign: "center",
		color: colors.text.secondary,
	},
});
