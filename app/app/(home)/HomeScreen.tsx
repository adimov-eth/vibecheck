import React from 'react';
import { View, ScrollView, StyleSheet, Text, SafeAreaView, Dimensions } from 'react-native';
import { colors, spacing, typography, layout } from '../styles';
import ModeCard from '../../components/ModeCard';
import AppBar from '../../components/AppBar';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

interface Mode {
  id: string;
  title: string;
  description: string;
  color: string;
}

const modes: Mode[] = [
  {
    id: 'mediator',
    title: 'Mediator',
    description: 'Get balanced insights',
    color: '#58BD7D',
  },
  {
    id: 'counselor',
    title: 'Who\'s Right',
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

export default function HomeScreen() {
  const router = useRouter();

  const handleSelectMode = (mode: Mode) => {
    router.push({
      pathname: './mode/[id]',
      params: { 
        id: mode.id,
        title: mode.title,
        description: mode.description,
        color: mode.color
      }
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
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
          
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Choose a Mode</Text>
              <Text style={styles.sectionSubtitle}>Select the type of conversation you want to have</Text>
            </View>
            
            <View style={styles.modesContainer}>
              {modes.map((mode, index) => (
                <ModeCard
                  key={mode.id}
                  mode={mode.id}
                  title={mode.title}
                  description={mode.description}
                  color={mode.color}
                  onPress={() => handleSelectMode(mode)}
                  style={index === modes.length - 1 ? styles.lastCard : undefined}
                />
              ))}
            </View>
          </View>
          
          {/* <View style={styles.customModeContainer}>
            <Text style={styles.customModeText}>Need something specific?</Text>
            <Button 
              title="Create Custom Mode" 
              variant="outline"
              size="medium"
              onPress={() => {}} 
              style={styles.customModeButton}
            />
          </View> */}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  scrollContent: {
    paddingHorizontal: width * 0.05, // 5% of screen width
    paddingBottom: spacing.section,
  },
  sectionContainer: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    marginBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    ...typography.heading3,
    marginBottom: spacing.xs,
    textAlign: 'left', // Ensure left alignment
  },
  sectionSubtitle: {
    ...typography.body2,
    color: colors.mediumText,
    textAlign: 'left', // Ensure left alignment
  },
  modesContainer: {
    width: '100%',
  },
  lastCard: {
    marginBottom: 0, // Remove margin from last card
  },
  customModeContainer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.md,
  },
  customModeText: {
    ...typography.body1,
    marginBottom: spacing.md,
    color: colors.darkText,
    textAlign: 'center',
  },
  customModeButton: {
    width: '90%', // More appropriate width
    maxWidth: 300, // Maximum width for larger screens
  },
});