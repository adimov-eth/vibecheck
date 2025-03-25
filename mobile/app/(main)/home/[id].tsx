import { ModeCard } from '@/components/conversation/ModeCard';
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/constants/styles';
import { useUsage } from '@/hooks';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

// Define the Mode interface since we're using it locally
interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

// Mapping of mode IDs to their detailed descriptions
const MODE_DESCRIPTIONS: Record<string, string> = {
  mediator: "Record both sides of a disagreement, and VibeCheck will provide a balanced perspective. Our AI will identify common ground and suggest compromises without taking sides.",
  counselor: "Record both sides of an argument, and VibeCheck will analyze who's right based on facts and reasoning. Get an objective third-party verdict without emotion or bias.",
  dinner: "Can't decide where to eat? Record both preferences and constraints, and VibeCheck will analyze your options and help you reach a decision that satisfies everyone.",
  movie: "Record what you're both in the mood to watch, and VibeCheck will help you find the perfect movie or show that matches both your interests and preferences.",
  default: "Record your conversation and VibeCheck will provide an objective analysis to help you reach a resolution."
};

export default function ModeDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { checkCanCreateConversation } = useUsage();
  
  // Parse the params to get our mode data
  const modeId = typeof id === 'string' ? id : '';
  
  // Alternatively, we might have a getModeById function in a utils file or a modes store
  // But for simplicity, recreate from available data
  const mode: Mode = {
    id: modeId,
    title: getModeTitle(modeId),
    description: getModeShortDescription(modeId),
    color: getModeColor(modeId),
  };

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  const startRecording = async () => {
    const canCreate = await checkCanCreateConversation();
    if (canCreate) {
      router.push(`../recording/${mode.id}`);
    }
  };

  return (
    <Container withSafeArea style={styles.container}>
      <AppBar 
        showBackButton
        onBackPress={handleGoBack}
        title="Mode Details"
      />
      
      <View style={styles.content}>
        <View style={styles.cardContainer}>
          <ModeCard
            id={mode.id}
            mode={mode.id}
            title={mode.title}
            description={mode.description}
            color={mode.color}
            onPress={() => {}}
          />
        </View>

        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionTitle}>How it works</Text>
          <Text style={styles.description}>
            {MODE_DESCRIPTIONS[mode.id] || MODE_DESCRIPTIONS.default}
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title="Start Conversation"
            variant="primary"
            size="large"
            onPress={startRecording}
          />
        </View>
      </View>
    </Container>
  );
}

// Helper functions to get mode details based on ID
// In a real app, this data would likely come from a central store or API
function getModeTitle(modeId: string): string {
  const modeTitles: Record<string, string> = {
    mediator: 'Mediator',
    counselor: "Who's Right",
    dinner: 'Dinner Planner',
    movie: 'Movie Night',
  };
  return modeTitles[modeId] || 'Mode';
}

function getModeShortDescription(modeId: string): string {
  const modeDescriptions: Record<string, string> = {
    mediator: 'Get balanced insights',
    counselor: 'Get a clear verdict',
    dinner: 'Decide what to eat',
    movie: 'Find something to watch',
  };
  return modeDescriptions[modeId] || 'Analyze your conversation';
}

function getModeColor(modeId: string): string {
  const modeColors: Record<string, string> = {
    mediator: '#58BD7D',
    counselor: '#3B71FE',
    dinner: '#4BC9F0',
    movie: '#FF6838',
  };
  return modeColors[modeId] || '#3B71FE';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  } as ViewStyle,
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  } as ViewStyle,
  cardContainer: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  } as ViewStyle,
  descriptionContainer: {
    flex: 1,
  } as ViewStyle,
  descriptionTitle: {
    ...typography.heading3,
    marginBottom: spacing.md,
    color: colors.text.primary,
  } as TextStyle,
  description: {
    ...typography.body1,
    color: colors.text.secondary,
  } as TextStyle,
  buttonContainer: {
    paddingVertical: spacing.xl,
  } as ViewStyle,
});