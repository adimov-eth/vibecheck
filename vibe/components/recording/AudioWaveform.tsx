import { animation, colors } from "@/constants/styles";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

interface AudioWaveformProps {
	isActive: boolean;
	color?: string;
	barCount?: number;
	intensity?: number;
	testID?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
	isActive,
	color = colors.primary,
	barCount = 40,
	intensity = 0.8,
	testID,
}) => {
	// Create animated values for each bar - memoize to prevent recreation on re-renders
	const barValues = useMemo(() => 
		Array(barCount)
			.fill(0)
			.map(() => new Animated.Value(0.3)),
		[barCount]
	);

	// Create phase animations - memoize to prevent recreation on re-renders
	const phaseAnim = useMemo(() => new Animated.Value(0), []);
	const idlePhaseAnim = useMemo(() => new Animated.Value(0), []);
	
	// Track if idle animation is running
	const idleAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

	// Idle animation effect
	useEffect(() => {
		// Start gentle idle animation that runs continuously
		idleAnimationRef.current = Animated.loop(
			Animated.sequence([
				Animated.timing(idlePhaseAnim, {
					toValue: 1,
					duration: 3000,
					useNativeDriver: false,
				}),
				Animated.timing(idlePhaseAnim, {
					toValue: 0,
					duration: 3000,
					useNativeDriver: false,
				}),
			]),
		);
		idleAnimationRef.current.start();

		return () => {
			if (idleAnimationRef.current) {
				idleAnimationRef.current.stop();
			}
		};
	}, [idlePhaseAnim]);

	useEffect(() => {
		let phaseAnimation: Animated.CompositeAnimation | null = null;
		let activeListener: string | null = null;
		let idleListener: string | null = null;

		if (isActive) {
			// Active recording animation
			phaseAnimation = Animated.loop(
				Animated.sequence([
					Animated.timing(phaseAnim, {
						toValue: 1,
						duration: 1000,
						useNativeDriver: false,
					}),
					Animated.timing(phaseAnim, {
						toValue: 0,
						duration: 1000,
						useNativeDriver: false,
					}),
				]),
			);

			// Start animation
			phaseAnimation.start();

			// Update bar heights based on active phase
			activeListener = phaseAnim.addListener(({ value }) => {
				barValues.forEach((anim, i) => {
					const phase = (value + i / barCount) % 1;
					const waveHeight = Math.abs(Math.sin(phase * Math.PI * 2));
					const randomVariation = 0.1 + Math.random() * 0.1;
					const height = 0.2 + (intensity * waveHeight + randomVariation) * 0.7;
					
					Animated.timing(anim, {
						toValue: height,
						duration: 100,
						useNativeDriver: false,
					}).start();
				});
			});
		} else {
			// Idle state with subtle animation
			idleListener = idlePhaseAnim.addListener(({ value }) => {
				barValues.forEach((anim, i) => {
					const normalizedPosition = i / barCount;
					const centerDistance = Math.abs(normalizedPosition - 0.5) * 2;
					
					// Create a gentle wave effect
					const waveOffset = Math.sin((value + normalizedPosition) * Math.PI * 2);
					const baseHeight = 0.25 + (1 - centerDistance) * 0.15;
					const variation = waveOffset * 0.05;
					const targetHeight = baseHeight + variation;
					
					Animated.spring(anim, {
						toValue: targetHeight,
						speed: 2,
						bounciness: 4,
						useNativeDriver: false,
					}).start();
				});
			});
		}

		// Clean up animations and listeners
		return () => {
			if (phaseAnimation) {
				phaseAnimation.stop();
			}
			if (activeListener) {
				phaseAnim.removeListener(activeListener);
			}
			if (idleListener) {
				idlePhaseAnim.removeListener(idleListener);
			}
		};
	}, [isActive, barValues, phaseAnim, idlePhaseAnim, barCount, intensity]);

	// Use key to force proper garbage collection when props change
	const componentKey = `waveform-${barCount}-${isActive ? 'active' : 'inactive'}`;

	return (
		<View style={styles.container} testID={testID} key={componentKey}>
			<View style={styles.waveform}>
				{barValues.map((anim, index) => {
					const isCenter = index === Math.floor(barCount / 2);
					const opacity = isCenter
						? 1
						: 0.5 +
						0.5 * (1 - Math.abs((index - barCount / 2) / (barCount / 2)));

					return (
						<Animated.View
							key={`${componentKey}-bar-${index}`}
							style={[
								styles.bar,
								{
									backgroundColor: color,
									opacity,
									transform: [
										{
											scaleY: anim.interpolate({
												inputRange: [0, 1],
												outputRange: [0.2, 1],
											}),
										},
									],
								},
							]}
						/>
					);
				})}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		width: "100%",
		height: "100%",
		overflow: "hidden",
	},
	waveform: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 8,
	},
	bar: {
		flex: 1,
		height: "80%",
		marginHorizontal: 1,
		borderRadius: 2,
	},
});