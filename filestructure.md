 vibecheck git:(v42) tree --gitignore
.
├── mobile
│   ├── README.md
│   ├── app
│   │   ├── (auth)
│   │   │   ├── [verify-email].tsx
│   │   │   ├── _layout.tsx
│   │   │   ├── forgot-password.tsx
│   │   │   ├── sign-in.tsx
│   │   │   └── sign-up.tsx
│   │   ├── (main)
│   │   │   ├── _layout.tsx
│   │   │   ├── home
│   │   │   │   ├── [id].tsx
│   │   │   │   └── index.tsx
│   │   │   ├── paywall.tsx
│   │   │   ├── profile
│   │   │   │   ├── index.tsx
│   │   │   │   └── update-password.tsx
│   │   │   ├── recording
│   │   │   │   ├── [id].tsx
│   │   │   │   └── _layout.tsx
│   │   │   └── results
│   │   │       └── [id].tsx
│   │   ├── _layout.tsx
│   │   └── index.tsx
│   ├── app.json
│   ├── assets
│   │   ├── fonts
│   │   │   └── SpaceMono-Regular.ttf
│   │   └── images
│   │       ├── adaptive-icon.png
│   │       ├── favicon.png
│   │       ├── icon.png
│   │       ├── partial-react-logo.png
│   │       ├── react-logo.png
│   │       ├── react-logo@2x.png
│   │       ├── react-logo@3x.png
│   │       └── splash-icon.png
│   ├── components
│   │   ├── conversation
│   │   │   ├── ErrorView.tsx
│   │   │   ├── LoadingView.tsx
│   │   │   ├── ModeCard.tsx
│   │   │   └── ResultsView.tsx
│   │   ├── feedback
│   │   │   └── ErrorMessage.tsx
│   │   ├── forms
│   │   │   ├── FormField.tsx
│   │   │   └── PasswordInput.tsx
│   │   ├── layout
│   │   │   ├── AppBar.tsx
│   │   │   ├── Container.tsx
│   │   │   └── ErrorDisplay.tsx
│   │   ├── recording
│   │   │   ├── AudioWaveform.tsx
│   │   │   ├── RecordButton.tsx
│   │   │   ├── Timer.tsx
│   │   │   └── WaveVisualization.tsx
│   │   └── ui
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Toast.tsx
│   │       └── Toggle.tsx
│   ├── constants
│   │   └── styles.ts
│   ├── eas.json
│   ├── hooks
│   │   ├── index.ts
│   │   ├── useConversation.ts
│   │   ├── useConversationResult.ts
│   │   ├── useRecordingFlow.ts
│   │   ├── useSubscription.ts
│   │   ├── useUsage.ts
│   │   └── useWebSocket.ts
│   ├── index.js
│   ├── lint.txt
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── registerNativeModules.js
│   ├── scripts
│   │   └── reset-project.js
│   ├── state
│   │   ├── index.ts
│   │   ├── slices
│   │   │   ├── conversationSlice.ts
│   │   │   ├── subscriptionSlice.ts
│   │   │   ├── uploadSlice.ts
│   │   │   └── websocketSlice.ts
│   │   └── types.ts
│   ├── tsconfig.json
│   ├── types
│   │   ├── analysis.ts
│   │   └── react-native-iap.d.ts
│   ├── utils
│   │   └── date.ts
│   └── validations
│       └── auth.ts
└── server
    ├── CLAUDE.md
    ├── ProjectStructure.md
    ├── README.md
    ├── eslint.config.js
    ├── package.json
    ├── src
    │   ├── api
    │   │   ├── index.ts
    │   │   └── routes
    │   │       ├── audio.ts
    │   │       ├── conversation.ts
    │   │       ├── subscription.ts
    │   │       ├── user.ts
    │   │       └── webhook.ts
    │   ├── config.ts
    │   ├── database
    │   │   ├── connection-pool.ts
    │   │   ├── index.ts
    │   │   └── schema.ts
    │   ├── index.ts
    │   ├── middleware
    │   │   ├── auth.ts
    │   │   ├── ensure-user.ts
    │   │   ├── error.ts
    │   │   ├── rate-limit.ts
    │   │   └── webhook.ts
    │   ├── queues
    │   │   └── index.ts
    │   ├── scripts
    │   │   └── clean-queues.ts
    │   ├── services
    │   │   ├── audio-service.ts
    │   │   ├── conversation-service.ts
    │   │   ├── notification-service.ts
    │   │   ├── subscription-serivice.ts
    │   │   ├── usage-service.ts
    │   │   ├── user-cache-service.ts
    │   │   ├── user-service.ts
    │   │   └── webhook-service.ts
    │   ├── types
    │   │   ├── clerk.d.ts
    │   │   ├── express.d.ts
    │   │   ├── index.ts
    │   │   ├── webhook.ts
    │   │   └── websocket.ts
    │   ├── utils
    │   │   ├── auth.ts
    │   │   ├── file.ts
    │   │   ├── index.ts
    │   │   ├── logger.ts
    │   │   ├── openai.ts
    │   │   ├── system-prompts.ts
    │   │   ├── validation.ts
    │   │   └── websocket.ts
    │   └── workers
    │       ├── audio-worker.ts
    │       ├── cleanup-worker.ts
    │       └── gpt-worker.ts
    ├── sys.json
    ├── tsconfig.json
    └── uploads