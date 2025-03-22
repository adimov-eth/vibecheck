import { API_BASE_URL } from '../utils/apiEndpoints';

interface WebSocketMessage {
  type: string;
  payload: any;
  topic?: string;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private subscriptions = new Set<string>();
  private token: string | null = null;
  private url: string;

  // Accept token as a constructor parameter
  constructor(token: string) {
    this.token = token;
    this.url = `${API_BASE_URL.replace('http', 'ws')}/ws`;
  }

  async connect() {
    if (!this.token) {
      throw new Error('Authentication failed: Invalid token');
    }
    this.ws = new WebSocket(`${this.url}?token=${this.token}`);
    this.setupHandlers();
  }

  private setupHandlers() {
    if (!this.ws) return;
    this.ws.onopen = () => console.log('WebSocket connected');
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as WebSocketMessage;
      console.log('WebSocket message:', message);
      //TODO
      // Handle incoming messages based on your app's logic
    };
    this.ws.onclose = () => console.log('WebSocket closed');
    this.ws.onerror = (error) => console.error('WebSocket error:', error);
  }

  subscribeToConversation(conversationId: string) {
    const topic = `conversation:${conversationId}`;
    this.subscriptions.add(topic);
    this.send({ type: 'subscribe', topic });
  }

  onMessage(callback: (msg: WebSocketMessage) => void) {
    this.ws?.addEventListener('message', (event) => callback(JSON.parse(event.data)));
  }

  send(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}