import { ModeCard } from '@/components/conversation/ModeCard';
import { AppBar } from '@/components/layout/AppBar';
import { Container } from '@/components/layout/Container';
import { colors, spacing, typography } from '@/constants/styles';
import { useSubscriptionStore, useUsageStore } from '@/hooks/useTypedStore';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

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
  
  // Get subscription status
  const { isSubscribed, subscriptionPlan } = useSubscriptionStore();
  
  // Get usage limits
  const { remainingConversations, usageLimit } = useUsageStore();

  // Navigate to mode details screen
  const handleSelectMode = (mode: typeof CONVERSATION_MODES[0]) => {
    router.push({
      pathname: `./home/${mode.id}`,
      params: { id: mode.id }
    });
  };

  return (
    <Container withSafeArea>
      <AppBar title="VibeCheck" />
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.headerSubtitle}>
            An objective 3rd party to help you settle whatever needs settling
          </Text>
        </View>
        
        <View style={styles.usageContainer}>
          <Text style={styles.usageText}>
            {isSubscribed ? 
              `Unlimited conversations (${subscriptionPlan})` : 
              `${remainingConversations} of ${usageLimit} conversations left`
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
});