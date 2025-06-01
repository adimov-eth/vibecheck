// /Users/adimov/Developer/final/vibe/app/(main)/recording/[id].tsx
import { ModeCard } from "@/components/conversation/ModeCard";
import { AppBar } from "@/components/layout/AppBar";
import { Container } from "@/components/layout/Container";
import { AudioWaveform } from "@/components/recording/AudioWaveform";
import { RecordButton } from "@/components/recording/RecordButton";
import { Button } from "@/components/ui/Button"; // Import Button for retry
import { Toggle } from "@/components/ui/Toggle";
import { colors, spacing, typography } from "@/constants/styles";
import { useRecordingFlow } from "@/hooks";
import useStore from "@/state"; // Import useStore
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

interface Mode {
	id: string;
	title: string;
	description: string;
	color: string;
}

// Helper function (remains the same)
function getModeDetails(id: string): Mode {
	const modes: Record<string, Mode> = {
		mediator: {
			id: "mediator",
			title: "Mediator",
			description: "Get balanced insights",
			color: "#58BD7D",
		},
		counselor: {
			id: "counselor",
			title: "Who's Right",
			description: "Get a clear verdict",
			color: "#3B71FE",
		},
		dinner: {
			id: "dinner",
			title: "Dinner Planner",
			description: "Decide what to eat",
			color: "#4BC9F0",
		},
		movie: {
			id: "movie",
			title: "Movie Night",
			description: "Find something to watch",
			color: "#FF6838",
		},
	};
	return (
		modes[id] || {
			id,
			title: "Recording",
			description: "Record your conversation",
			color: "#3B71FE",
		}
	);
}

// Define the component function
function RecordingScreen() {
	// Renamed internally for clarity with memo
	const { id: modeParam } = useLocalSearchParams();
	const router = useRouter();
	const store = useStore(); // Direct store access might be less needed now

	const modeId = typeof modeParam === "string" ? modeParam : "";
	const [mode, setMode] = useState<Mode>(() => getModeDetails(modeId));

	// --- Use the refactored hook ---
	const {
		localId,
		recordMode,
		currentPartner,
		flowState, // <- Use FSM state
		error: recordingError,
		isButtonDisabled,
		handleToggleMode,
		handleToggleRecording,
		handleRetry, // <- Get retry handler
		cleanup,
	} = useRecordingFlow({ modeId });
	// --- End hook usage ---

	const serverId = useStore(
		useCallback((state) => state.localToServerIds[localId], [localId]),
	);

	// Effect to navigate when the flow state is 'complete' and serverId is known
	useEffect(() => {
		// Navigate only when the flow state is explicitly 'complete' AND serverId is available
		if (flowState === "complete" && serverId) {
			console.log(
				`[RecordingScreen] Flow complete and serverId ${serverId} known. Navigating to results...`,
			);
			router.replace(`../results/${serverId}`);
		} else if (flowState === "waitingForServerId") {
			console.log(
				`[RecordingScreen] Flow state is 'waitingForServerId'. Waiting for serverId mapping...`,
			);
			// Stay on this screen, processing indicator will be shown based on flowState
		}
	}, [flowState, serverId, router]); // Depend on flowState and serverId

	// Load mode details (remains the same)
	useEffect(() => {
		setMode(getModeDetails(modeId));
	}, [modeId]);

	// Cleanup on unmount (remains similar, hook handles more internally)
	useEffect(() => {
		return () => {
			console.log(
				"[RecordingScreen] Component unmounting. Hook cleanup should handle AV resources.",
			);
			// The hook's internal cleanup now manages stopping recording if needed.
		};
	}, []); // No dependency on cleanup needed here, hook manages its own lifecycle

	// Determine if a processing indicator should be shown based on flowState
	const showProcessingIndicator = [
		"checkingPermissions",
		"creatingConversation",
		"stopping",
		"savingIntent",
		"waitingForServerId",
	].includes(flowState);

	// Determine the text for the processing indicator
	const getProcessingText = (): string => {
		switch (flowState) {
			case "checkingPermissions":
				return "Checking permissions...";
			case "creatingConversation":
				return "Preparing conversation...";
			case "stopping":
				return "Stopping recording...";
			case "savingIntent":
				return "Saving recording...";
			case "waitingForServerId":
				return "Finalizing...";
			default:
				return "Processing..."; // Fallback
		}
	};

	// Determine if the back button should be disabled
	const isBackDisabled = flowState === "recording" || showProcessingIndicator;

	// Determine if the toggle should be disabled
	const isToggleDisabled = [
		"recording",
		"stopping",
		"savingIntent",
		"waitingForServerId",
		"creatingConversation",
		"checkingPermissions",
	].includes(flowState);

	return (
		<Container withSafeArea>
			<AppBar
				title={mode.title}
				showBackButton
				// Disable back button during recording or processing states
				onBackPress={() => !isBackDisabled && router.back()}
			/>
			<View style={styles.content}>
				{/* Mode Card (remains the same) */}
				<View style={styles.modeCardContainer}>
					<ModeCard
						id={mode.id}
						mode={mode.id}
						title={mode.title}
						description={mode.description}
						color={mode.color}
						onPress={() => {}} // Non-interactive
					/>
				</View>

				<View style={styles.divider} />

				{/* Recording Controls */}
				<View style={styles.controlsContainer}>
					<Text style={styles.modeLabelText}>Recording Mode</Text>
					<Toggle
						options={["Separate", "Live"]}
						selectedIndex={recordMode === "separate" ? 0 : 1}
						onChange={handleToggleMode}
						// Disable toggle based on FSM state
						disabled={isToggleDisabled}
					/>
				</View>

				{/* Partner Indicator for Separate Mode */}
				{recordMode === "separate" &&
					!showProcessingIndicator &&
					flowState !== "recording" && ( // Show only when idle/ready/error in separate mode
						<View style={styles.partnerContainer}>
							<Text style={styles.partnerText}>Partner {currentPartner}</Text>
							{currentPartner === 2 && (
								<View style={styles.recordedIndicator}>
									<Ionicons
										name="checkmark-circle"
										size={18}
										color={colors.success}
									/>
									<Text style={styles.recordedText}>Partner 1 recorded</Text>
								</View>
							)}
						</View>
					)}

				{/* Recording Button and Status */}
				<View style={styles.recordingContainer}>
					{showProcessingIndicator ? (
						<View style={styles.processingContainer}>
							<ActivityIndicator size="large" color={colors.primary} />
							<Text style={styles.processingText}>{getProcessingText()}</Text>
						</View>
					) : flowState === "error" ? (
						// --- Error State UI ---
						<View style={styles.errorContainer}>
							<Ionicons
								name="alert-circle-outline"
								size={48}
								color={colors.error}
							/>
							<Text style={styles.errorTitle}>Error</Text>
							<Text style={styles.errorText}>
								{recordingError || "An unknown error occurred."}
							</Text>
							{handleRetry && ( // Show retry button if handler exists
								<Button
									title="Try Again"
									variant="primary"
									onPress={handleRetry}
									style={styles.retryButton}
								/>
							)}
							<Button
								title="Go Back"
								variant="outline"
								onPress={() => router.back()}
								style={styles.retryButton} // Reuse style for spacing
							/>
						</View>
					) : (
						// --- Idle / Ready / Recording State UI ---
						<>
							<RecordButton
								isRecording={flowState === "recording"} // Pass based on state
								onPress={handleToggleRecording}
								disabled={isButtonDisabled}
							/>
							<Text style={styles.recordingInstructions}>
								{flowState === "recording"
									? "Recording... Tap to stop"
									: flowState === "readyToRecord" || flowState === "idle"
										? "Tap to start recording"
										: ""}
							</Text>
						</>
					)}
				</View>

				{/* Waveform Visualization */}
				{!showProcessingIndicator &&
					flowState !== "error" && ( // Hide waveform during processing and error
						<View style={styles.waveformContainer}>
							<AudioWaveform isActive={flowState === "recording"} />
						</View>
					)}
			</View>
		</Container>
	);
}

// Styles (add styles for error state)
const styles = StyleSheet.create({
	content: { flex: 1, padding: spacing.lg },
	modeCardContainer: { marginBottom: spacing.md },
	divider: {
		height: 1,
		backgroundColor: colors.border,
		marginVertical: spacing.md,
	},
	controlsContainer: { marginBottom: spacing.lg, alignItems: "center" },
	modeLabelText: { ...typography.body2, marginBottom: spacing.sm },
	partnerContainer: { alignItems: "center", marginVertical: spacing.lg },
	partnerText: { ...typography.heading2, marginBottom: spacing.sm },
	recordedIndicator: { flexDirection: "row", alignItems: "center" },
	recordedText: {
		...typography.body2,
		color: colors.success,
		marginLeft: spacing.xs,
	},
	recordingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	recordingInstructions: {
		...typography.body2,
		color: colors.text.secondary,
		marginTop: spacing.md,
	},
	waveformContainer: {
		height: 120,
		marginVertical: spacing.lg,
		justifyContent: "center",
		alignItems: "center",
	}, // Added center alignment
	processingContainer: {
		alignItems: "center",
		justifyContent: "center",
		flex: 1,
	}, // Ensure it takes space
	processingText: {
		...typography.body2,
		color: colors.text.secondary,
		marginTop: spacing.md,
	},
	// Error State Styles
	errorContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: spacing.lg,
	},
	errorTitle: {
		...typography.heading2,
		color: colors.error,
		marginBottom: spacing.sm,
		marginTop: spacing.md,
	},
	errorText: {
		...typography.body1,
		color: colors.text.secondary,
		textAlign: "center",
		marginBottom: spacing.xl,
	},
	retryButton: {
		minWidth: 150,
		marginTop: spacing.md,
	},
});

// Wrap the component with React.memo before exporting
export default React.memo(RecordingScreen);
