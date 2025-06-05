import { mock } from 'bun:test';

export class MockNotificationService {
  sendPushNotification = mock(async (userId: string, notification: any) => ({
    success: true,
    messageId: `mock-message-${Date.now()}`,
    userId,
    notification
  }));
  
  sendEmail = mock(async (to: string, subject: string, body: string) => ({
    success: true,
    messageId: `mock-email-${Date.now()}`,
    to,
    subject
  }));
  
  sendSMS = mock(async (phoneNumber: string, message: string) => ({
    success: true,
    messageId: `mock-sms-${Date.now()}`,
    phoneNumber
  }));
  
  // Track notification history
  private notificationHistory: any[] = [];
  
  getHistory() {
    return this.notificationHistory;
  }
  
  clearHistory() {
    this.notificationHistory = [];
  }
  
  // Override methods to track history
  constructor() {
    this.sendPushNotification.mockImplementation(async (userId, notification) => {
      const result = {
        success: true,
        messageId: `mock-message-${Date.now()}`,
        userId,
        notification,
        timestamp: new Date()
      };
      this.notificationHistory.push({ type: 'push', ...result });
      return result;
    });
    
    this.sendEmail.mockImplementation(async (to, subject, body) => {
      const result = {
        success: true,
        messageId: `mock-email-${Date.now()}`,
        to,
        subject,
        timestamp: new Date()
      };
      this.notificationHistory.push({ type: 'email', ...result });
      return result;
    });
  }
  
  // Simulate notification failure
  simulateFailure(type: 'push' | 'email' | 'sms') {
    const error = new Error(`Failed to send ${type} notification`);
    
    switch (type) {
      case 'push':
        this.sendPushNotification.mockRejectedValueOnce(error);
        break;
      case 'email':
        this.sendEmail.mockRejectedValueOnce(error);
        break;
      case 'sms':
        this.sendSMS.mockRejectedValueOnce(error);
        break;
    }
  }
  
  reset() {
    this.sendPushNotification.mockReset();
    this.sendEmail.mockReset();
    this.sendSMS.mockReset();
    this.clearHistory();
  }
}

export const mockNotificationService = new MockNotificationService();