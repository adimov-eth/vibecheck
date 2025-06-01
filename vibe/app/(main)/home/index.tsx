// /Users/adimov/Developer/final/vibe/app/(main)/home/index.tsx
import { ModeCard } from '@/components/conversation/ModeCard';
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/constants/styles';
import { useUsage } from '@/hooks/useUsage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

// Define the available conversation modes
const CONVERSATION_MODES = [
  {
    id: 'mediator',
    title: 'Mediator',
    description: 'Get balanced insights',
    color: '#58BD7D',
  },
  {
    id: 'counselor',
    title: "Who's Right",
    description: 'Get a clear verdict',
    color: '#3B71FE',
  },
  {
    id: 'dinner',
    title: 'Dinner Planner',
    description: 'Decide what to eat',
    color: '#4BC9F0',
  },
  {
    id: 'movie',
    title: 'Movie Night',
    description: 'Find something to watch',
    color: '#FF6838',
  },
];

export default function Home() {
  const router = useRouter();
  const {
    usageStats,
    loading,
    error, // error is string | null
    checkCanCreateConversation,
    loadData
  } = useUsage();
  const initialLoadRef = useRef(false);

  // Load usage stats on mount only once
  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      loadData();
    }
  }, [loadData]);

  // Navigate to mode details screen
  const handleSelectMode = async (mode: typeof CONVERSATION_MODES[0]) => {
    const canCreate = await checkCanCreateConversation();
    if (canCreate) {
      // Changed navigation target to mode details screen first
      router.push(`/home/${mode.id}`);
      // Original direct navigation: router.push(`/recording/${mode.id}`);
    }
  };

  // Loading state
  if (loading && !usageStats) {
    return (
      <Container withSafeArea>
        <AppBar title="VibeCheck" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container withSafeArea>
        <AppBar title="VibeCheck" />
        <View style={styles.errorContainer}>
          {/* Display the error string directly */}
          <Text style={styles.errorText}>{error || 'Failed to load subscription data'}</Text>
          <Button
            title="Retry"
            variant="primary"
            onPress={loadData}
            style={styles.retryButton}
          />
        </View>
      </Container>
    );
  }

  return (
    <Container withSafeArea>
      <AppBar title="VibeCheck" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadData}
            colors={[colors.primary]}
            tintColor={colors.primary} // Added for iOS consistency
          />
        }
      >

        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Choose a Mode</Text>
            <Text style={styles.sectionSubtitle}>Select the type of conversation you want to analyze</Text>
          </View>

          <View style={styles.modesContainer}>
            {CONVERSATION_MODES.map((mode, index) => (
              <ModeCard
                key={mode.id}
                id={mode.id}
                mode={mode.id} // Pass mode ID for icon lookup
                title={mode.title}
                description={mode.description}
                color={mode.color}
                onPress={() => handleSelectMode(mode)}
                style={index === CONVERSATION_MODES.length - 1 ? styles.lastCard : undefined}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md, // Reduced top padding
    paddingBottom: spacing.section,
    flexGrow: 1, // Ensure ScrollView content can grow
  },
  sectionContainer: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.heading3,
    marginBottom: spacing.xs,
    color: colors.text.primary, // Ensure text color
  },
  sectionSubtitle: {
    ...typography.body2,
    color: colors.text.secondary,
  },
  modesContainer: {
    width: '100%',
  },
  lastCard: {
    marginBottom: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body1,
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorText: {
    ...typography.body1,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg, // Added margin below text
  },
  retryButton: {
    marginTop: spacing.md,
    minWidth: 120,
  },
});