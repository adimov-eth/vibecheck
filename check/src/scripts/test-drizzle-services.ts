#!/usr/bin/env bun
// Test script for Drizzle services

import { log } from '../utils/logger';
import * as userServiceV2 from '../services/user-service-v2';
import * as conversationServiceV2 from '../services/conversation-service-v2';
import { randomUUIDv7 } from 'bun';

async function testServices() {
  log.info('Testing Drizzle services...');
  
  try {
    // Test user service
    const testEmail = `test-${Date.now()}@example.com`;
    const testUserId = randomUUIDv7();
    
    log.info('Creating test user...');
    const createResult = await userServiceV2.upsertUser({
      id: testUserId,
      email: testEmail,
      name: 'Test User'
    });
    
    if (!createResult.success) {
      throw new Error(`Failed to create user: ${createResult.error?.message}`);
    }
    
    log.info('User created successfully', { userId: testUserId });
    
    // Test fetching user
    const user = await userServiceV2.getUser(testUserId);
    if (!user) {
      throw new Error('Failed to fetch created user');
    }
    
    log.info('User fetched successfully', { user });
    
    // Test conversation service
    log.info('Creating test conversation...');
    const conversation = await conversationServiceV2.createConversation({
      userId: testUserId,
      mode: 'vent',
      recordingType: 'separate'
    });
    
    log.info('Conversation created successfully', { conversationId: conversation.id });
    
    // Test fetching conversation
    const fetchedConversation = await conversationServiceV2.getConversation(conversation.id);
    if (!fetchedConversation) {
      throw new Error('Failed to fetch created conversation');
    }
    
    log.info('Conversation fetched successfully', { conversation: fetchedConversation });
    
    // Test updating conversation
    await conversationServiceV2.updateConversationStatus(
      conversation.id,
      'completed',
      'Test GPT response',
      null
    );
    
    log.info('Conversation updated successfully');
    
    // Test getting user conversations
    const userConversations = await conversationServiceV2.getUserConversations(testUserId);
    log.info('User conversations fetched', { count: userConversations.length });
    
    // Cleanup
    await conversationServiceV2.deleteConversation(conversation.id, testUserId);
    await userServiceV2.deleteUser(testUserId);
    
    log.info('Test completed successfully! All Drizzle services are working.');
  } catch (error) {
    log.error('Test failed', { error });
    process.exit(1);
  }
}

testServices();