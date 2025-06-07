import { colors, spacing, typography } from "@/constants/styles";
import type React from "react";
import { useEffect, useRef } from "react";
import {
	Animated,
	StyleSheet,
	Text,
	View,
	ActivityIndicator,
} from "react-native";

interface AnimatedLoadingViewProps {
	progress: number;
	accentColor: string;
	status: "uploading" | "processing";
	testID?: string;
}

interface StageIndicator {
	label: string;
	start: number;
	end: number;
}

const stages: StageIndicator[] = [
	{ label: "Uploading", start: 0, end: 33 },
	{ label: "Transcribing", start: 33, end: 66 },
	{ label: "Analyzing", start: 66, end: 100 },
];

export const AnimatedLoadingView: React.FC<AnimatedLoadingViewProps> = ({
	progress,
	accentColor,
	status,
	testID,
}) => {
	const animatedProgress = useRef(new Animated.Value(0)).current;
	const pulseAnim = useRef(new Animated.Value(1)).current;

	// Animate progress changes smoothly
	useEffect(() => {
		Animated.timing(animatedProgress, {
			toValue: progress,
			duration: 800,
			useNativeDriver: false,
		}).start();
	}, [progress, animatedProgress]);

	// Pulse animation for the activity indicator
	useEffect(() => {
		const pulseAnimation = Animated.loop(
			Animated.sequence([
				Animated.timing(pulseAnim, {
					toValue: 1.1,
					duration: 1000,
					useNativeDriver: true,
				}),
				Animated.timing(pulseAnim, {
					toValue: 1,
					duration: 1000,
					useNativeDriver: true,
				}),
			]),
		);
		pulseAnimation.start();

		return () => {
			pulseAnimation.stop();
		};
	}, [pulseAnim]);

	// Calculate current stage
	const getCurrentStage = () => {
		for (const stage of stages) {
			if (progress >= stage.start && progress <= stage.end) {
				return stage.label;
			}
		}
		return stages[stages.length - 1].label;
	};

	const currentStage = getCurrentStage();

	return (
		<View style={styles.container} testID={`${testID}-animated-loading`}>
			<Animated.View
				style={[
					styles.indicatorContainer,
					{ transform: [{ scale: pulseAnim }] },
				]}
			>
				<ActivityIndicator size="large" color={accentColor} />
			</Animated.View>

			<Text style={styles.statusText}>{currentStage}</Text>
			<Text style={styles.subText}>
				{status === "uploading"
					? "Securing your conversation..."
					: "Processing with AI..."}
			</Text>

			<View style={styles.progressWrapper}>
				<View style={styles.progressBackground}>
					<Animated.View
						style={[
							styles.progressBar,
							{
								backgroundColor: accentColor,
								width: animatedProgress.interpolate({
									inputRange: [0, 100],
									outputRange: ["0%", "100%"],
								}),
							},
						]}
					/>
					<Animated.View
						style={[
							styles.progressGlow,
							{
								backgroundColor: accentColor,
								opacity: 0.3,
								width: animatedProgress.interpolate({
									inputRange: [0, 100],
									outputRange: ["0%", "100%"],
								}),
							},
						]}
					/>
				</View>

				{/* Stage indicators */}
				<View style={styles.stageIndicators}>
					{stages.map((stage, index) => (
						<View
							key={stage.label}
							style={[
								styles.stageIndicator,
								{
									left: `${stage.start}%`,
									opacity: progress >= stage.start ? 1 : 0.4,
								},
							]}
						>
							<View
								style={[
									styles.stageDot,
									{
										backgroundColor:
											progress >= stage.start ? accentColor : colors.border,
									},
								]}
							/>
							<Text
								style={[
									styles.stageLabel,
									{
										color:
											progress >= stage.start
												? colors.text.primary
												: colors.text.secondary,
									},
								]}
							>
								{stage.label}
							</Text>
						</View>
					))}
				</View>
			</View>

			<Animated.Text
				style={[
					styles.progressText,
					{
						opacity: animatedProgress.interpolate({
							inputRange: [0, 100],
							outputRange: [0.6, 1],
						}),
					},
				]}
			>
				{Math.round(progress)}%
			</Animated.Text>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: spacing.xl,
	},
	indicatorContainer: {
		marginBottom: spacing.xl,
	},
	statusText: {
		...typography.heading2,
		color: colors.text.primary,
		marginBottom: spacing.xs,
		textAlign: "center",
	},
	subText: {
		...typography.body2,
		color: colors.text.secondary,
		marginBottom: spacing.xl * 1.5,
		textAlign: "center",
	},
	progressWrapper: {
		width: "100%",
		maxWidth: 300,
		height: 60,
		marginBottom: spacing.lg,
	},
	progressBackground: {
		width: "100%",
		height: 8,
		backgroundColor: colors.border,
		borderRadius: 4,
		overflow: "hidden",
		position: "relative",
	},
	progressBar: {
		height: "100%",
		borderRadius: 4,
	},
	progressGlow: {
		position: "absolute",
		top: -4,
		left: 0,
		height: 16,
		borderRadius: 8,
		transform: [{ scaleY: 2 }],
	},
	stageIndicators: {
		position: "relative",
		width: "100%",
		height: 40,
		marginTop: spacing.md,
	},
	stageIndicator: {
		position: "absolute",
		alignItems: "center",
		transform: [{ translateX: -20 }],
	},
	stageDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginBottom: spacing.xs,
	},
	stageLabel: {
		...typography.caption,
		textAlign: "center",
	},
	progressText: {
		...typography.body1,
		color: colors.text.secondary,
	},
});