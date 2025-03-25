
⏺ Based on my analysis of the codebase, here's a mermaid diagram showing the client-server interactions in the VibeCheck application:

  graph TD
      %% Mobile App Components
      subgraph "Mobile App (Client)"
          MobileApp["Mobile App"]

          subgraph "State Management"
              ZustandStore["Zustand Store"]
              WebSocketSlice["WebSocket Slice"]
              ConversationSlice["Conversation Slice"]
              UploadSlice["Upload Slice"]
              SubscriptionSlice["Subscription Slice"]
          end

          subgraph "Hooks"
              UseWebSocket["useWebSocket"]
              UseConversation["useConversation"]
              UseConversationResult["useConversationResult"]
              UseRecordingFlow["useRecordingFlow"]
              UseSubscription["useSubscription"]
              UseUsage["useUsage"]
          end

          subgraph "UI Components"
              RecordingView["Recording View"]
              ResultsView["Results View"]
              ProfileView["Profile View"]
          end
      end

      %% Server Components
      subgraph "Server"
          APIServer["API Server"]

          subgraph "API Routes"
              ConversationRoutes["Conversation Routes"]
              AudioRoutes["Audio Routes"]
              SubscriptionRoutes["Subscription Routes"]
              UserRoutes["User Routes"]
          end

          subgraph "WebSocket"
              WebSocketManager["WebSocket Manager"]
              NotificationService["Notification Service"]
          end

          subgraph "Services"
              ConversationService["Conversation Service"]
              AudioService["Audio Service"]
              SubscriptionService["Subscription Service"]
              UserService["User Service"]
          end

          subgraph "Workers"
              AudioWorker["Audio Worker"]
              GPTWorker["GPT Worker"]
          end

          subgraph "Database"
              DB["PostgreSQL Database"]
          end
      end

      %% External Services
      subgraph "External Services"
          Clerk["Clerk Auth"]
          OpenAI["OpenAI API"]
      end

      %% Client-Server Interactions

      %% Authentication Flow
      MobileApp -->|"Auth with Clerk"| Clerk
      Clerk -->|"Session Token"| MobileApp

      %% WebSocket Connection
      UseWebSocket -->|"Establishes Connection"| WebSocketSlice
      WebSocketSlice -->|"Connect with Auth Token"| WebSocketManager
      UseConversationResult -->|"Subscribe to Topics"| WebSocketSlice

      %% Conversation Creation Flow
      UseConversation -->|"Create Conversation"| ConversationSlice
      ConversationSlice -->|"POST /conversations"| ConversationRoutes
      ConversationRoutes -->|"Create Record"| ConversationService
      ConversationService -->|"Store"| DB

      %% Audio Recording & Upload Flow
      UseRecordingFlow -->|"Record Audio"| RecordingView
      UseRecordingFlow -->|"Upload Audio"| UploadSlice
      UploadSlice -->|"POST /audio"| AudioRoutes
      AudioRoutes -->|"Process Audio"| AudioService
      AudioService -->|"Queue Job"| AudioWorker
      AudioWorker -->|"Transcribe"| OpenAI
      AudioWorker -->|"Update DB"| DB
      AudioWorker -->|"Send Notification"| NotificationService

      %% Analysis Flow
      AudioWorker -->|"Queue Analysis"| GPTWorker
      GPTWorker -->|"Process with GPT"| OpenAI
      GPTWorker -->|"Store Results"| DB
      GPTWorker -->|"Send Notification"| NotificationService

      %% Real-time Updates
      NotificationService -->|"Send WebSocket Message"| WebSocketManager
      WebSocketManager -->|"Deliver to Subscribed Client"| WebSocketSlice
      WebSocketSlice -->|"Update Messages"| UseConversationResult
      UseConversationResult -->|"Update UI"| ResultsView

      %% Subscription Management
      UseSubscription -->|"Check Status"| SubscriptionSlice
      SubscriptionSlice -->|"GET /subscriptions"| SubscriptionRoutes
      SubscriptionRoutes -->|"Verify Status"| SubscriptionService

      %% Usage Limits
      UseUsage -->|"Check Usage"| SubscriptionSlice
      SubscriptionSlice -->|"GET /usage"| SubscriptionRoutes