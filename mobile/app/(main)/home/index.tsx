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
    subscriptionStatus,
    usageStats,
    loading,
    error,
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
      router.push(`/home/${mode.id}`);
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
          <Text style={styles.errorText}>{error.message || 'Failed to load subscription data'}</Text>
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

  const remainingConversations = usageStats?.remainingConversations ?? 0;
  const isSubscribed = subscriptionStatus?.isActive ?? false;
  const subscriptionType = subscriptionStatus?.type;

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
          />
        }
      >
        <View style={styles.headerContainer}>
          <Text style={styles.headerSubtitle}>
            An objective 3rd party to help you settle whatever needs settling
          </Text>
        </View>
        
        <View style={styles.usageContainer}>
          <Text style={styles.usageText}>
            {isSubscribed ? 
              `Unlimited conversations (${subscriptionType})` : 
              `${remainingConversations} conversation${remainingConversations !== 1 ? 's' : ''} left`
            }
          </Text>
        </View>
        
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Choose a Mode</Text>
            <Text style={styles.sectionSubtitle}>Select the type of conversation you want to have</Text>
          </View>
          
          <View style={styles.modesContainer}>
            {CONVERSATION_MODES.map((mode, index) => (
              <ModeCard
                key={mode.id}
                id={mode.id}
                mode={mode.id}
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
    paddingBottom: spacing.section,
  },
  headerContainer: {
    alignItems: 'center',
    marginVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  headerSubtitle: {
    ...typography.body2,
    color: colors.mediumText,
    textAlign: 'center',
  },
  usageContainer: {
    backgroundColor: colors.primaryLight + '20', // light primary with opacity
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  usageText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: '500',
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
  },
  sectionSubtitle: {
    ...typography.body2,
    color: colors.mediumText,
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
    color: colors.mediumText,
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
  },
  retryButton: {
    marginTop: spacing.md,
    minWidth: 120,
  },
});