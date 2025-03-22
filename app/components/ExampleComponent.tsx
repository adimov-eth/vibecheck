import React, { useState } from 'react';
import { Button, View } from 'react-native';
import { useApi } from '../hooks/useAPI';
import { handleApiError } from '../utils/errorHandler';
import { ActivityIndicator } from 'react-native';
import { showToast } from './Toast';

const ExampleComponent = () => {
  const { createConversation } = useApi();
  const [loading, setLoading] = useState(false);

  const handleCreateConversation = async () => {
    setLoading(true);
    try {
      const result = await createConversation('123', 'normal', 'separate');
      showToast.success('Success', 'Conversation created!');
      return result;
    } catch (error) {
      handleApiError(error, {
        customMessages: {
          rateLimit: 'You\'ve reached the conversation creation limit. Please try again in a few minutes.',
          network: 'Unable to create conversation. Please check your internet connection and try again.'
        },
        onRateLimit: () => {
          // Additional rate limit specific logic
          console.log('Tracking rate limit hit...');
        }
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Button 
        title={loading ? "Creating..." : "Create Conversation"} 
        onPress={handleCreateConversation}
        disabled={loading}
      />
      {loading && <ActivityIndicator style={{ marginTop: 10 }} />}
    </View>
  );
};

export default ExampleComponent; 