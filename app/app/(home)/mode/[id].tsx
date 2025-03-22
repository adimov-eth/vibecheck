import React, { useState, useCallback } from 'react';
import { SafeAreaView, StyleSheet, View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, typography, spacing, layout } from '../../styles';
import RecordingScreen from '../RecordingScreen';
import AppBar from '../../../components/AppBar';
import ModeCard from '../../../components/ModeCard';
import Button from '../../../components/Button';
import { useUsage } from '../../../contexts/UsageContext';

// Define the Mode interface locally since it doesn't exist in a central types file
interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

export default function ModePage() {
  const router = useRouter();
  const { id, title, description, color } = useLocalSearchParams();
  const { checkCanCreateConversation } = useUsage();
  const [showRecording, setShowRecording] = useState(false);

  const selectedMode: Mode = {
    id: id as string,
    title: title as string,
    description: description as string,
    color: color as string,
  };

  const handleGoBack = useCallback(() => {
    if (showRecording) {
      setShowRecording(false);
    } else {
      router.back();
    }
  }, [showRecording, router]);

  const handleRecordingComplete = useCallback((conversationId: string) => {
    // Navigate to results screen with the conversation ID
    router.push({
      pathname: '/results/[id]' as any, // Using type assertion to fix TypeScript error
      params: { id: conversationId }
    });
  }, [router]);

  const handleStartRecording = async () => {
    // Check if user can create a new conversation
    const canCreate = await checkCanCreateConversation(true); // Show paywall if limit reached
    
    if (canCreate) {
      setShowRecording(true);
    }
    // If canCreate is false, the paywall or alert will be shown by checkCanCreateConversation
  };

  // If any required param is missing, go back to home
  if (!id || !title || !description || !color) {
    router.replace('/(home)');
    return null;
  }

  // Render recording screen if in recording mode
  if (showRecording) {
    return (
      <RecordingScreen
        selectedMode={selectedMode}
        onGoBack={handleGoBack}
        onRecordingComplete={handleRecordingComplete}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppBar
        showBackButton={true}
        onBackPress={handleGoBack}
        title="Mode Details"
      />
      <View style={styles.container}>
        <View style={styles.cardContainer}>
          <ModeCard
            mode={selectedMode.id}
            title={selectedMode.title}
            description={selectedMode.description}
            color={selectedMode.color}
            isActive={true}
            onPress={() => {}}
          />
        </View>
        
        <View style={styles.contentContainer}>
          <Text style={styles.descriptionTitle}>How it works</Text>
          <Text style={styles.description}>
            {getModeLongDescription(selectedMode.id)}
          </Text>
        </View>
        
        <View style={styles.actionsContainer}>
          <Button
            title="Start Conversation"
            variant="primary"
            size="large"
            onPress={handleStartRecording}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

// Get detailed description based on mode ID
function getModeLongDescription(modeId: string): string {
  switch (modeId) {
    case 'mediator':
      return "Record both sides of a disagreement, and VibeCheck will provide a balanced perspective. Our AI will identify common ground and suggest compromises without taking sides.";
    case 'counselor':
      return "Record both sides of an argument, and VibeCheck will analyze who's right based on facts and reasoning. Get an objective third-party verdict without emotion or bias.";
    case 'dinner':
      return "Can't decide where to eat? Record both preferences and constraints, and VibeCheck will analyze your options and help you reach a decision that satisfies everyone.";
    case 'movie':
      return "Record what you're both in the mood to watch, and VibeCheck will help you find the perfect movie or show that matches both your interests and preferences.";
    default:
      return "Record your conversation and VibeCheck will provide an objective analysis to help you reach a resolution.";
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: spacing.lg,
  },
  cardContainer: {
    marginBottom: spacing.lg,
  },
  contentContainer: {
    flex: 1,
  },
  descriptionTitle: {
    ...typography.heading3,
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body1,
    color: colors.mediumText,
  },
  actionsContainer: {
    paddingVertical: spacing.xl,
  },
});