# VibeCheck External Testing Checklist

## 🚦 Pre-Testing Setup Verification

### Backend Health Checks
- [ ] API server responds at `http://localhost:3000/health`
- [ ] Redis is running (`redis-cli ping` returns PONG)
- [ ] Database migrations completed successfully
- [ ] Background workers are running (check logs)

### Frontend Setup
- [ ] Expo server is running
- [ ] App loads in simulator/device
- [ ] Environment variables are correctly set

## 🧪 Core Functionality Testing

### 1. Authentication Flow
- [ ] Apple Sign-In button appears
- [ ] Sign-In completes successfully
- [ ] JWT token is stored and persists
- [ ] User profile loads correctly
- [ ] Sign out functionality works

### 2. Conversation Creation
- [ ] All conversation modes are selectable
- [ ] Recording type selection works (separate/live)
- [ ] Conversation creates successfully
- [ ] Conversation appears in list

### 3. Audio Recording
- [ ] Recording button responds to press
- [ ] Visual feedback during recording
- [ ] Audio records properly
- [ ] Stop recording works
- [ ] Recording time limit enforced

### 4. Audio Upload
- [ ] Upload starts automatically after recording
- [ ] Progress indicator shows
- [ ] Upload completes successfully
- [ ] Error handling for failed uploads
- [ ] Background upload works when app is minimized

### 5. Transcription & Analysis
- [ ] Transcription process starts
- [ ] WebSocket updates received
- [ ] Transcription completes
- [ ] GPT analysis starts
- [ ] Analysis results display correctly
- [ ] Error states handled gracefully

### 6. Subscription Management
- [ ] Subscription status displays correctly
- [ ] In-app purchase flow works
- [ ] Purchase restoration works
- [ ] Free tier limits enforced
- [ ] Premium features unlock after purchase

### 7. Data Persistence
- [ ] Conversations persist after app restart
- [ ] Draft recordings can be resumed
- [ ] User session persists
- [ ] Offline mode handles gracefully

## 🔍 Edge Cases & Error Handling

### Network Issues
- [ ] App handles offline state
- [ ] Requests retry appropriately
- [ ] Error messages are user-friendly
- [ ] Upload queue persists through network loss

### Audio Issues
- [ ] Microphone permission handling
- [ ] Recording interruption handling
- [ ] File size limits enforced
- [ ] Corrupt audio file handling

### API Errors
- [ ] Rate limiting messages clear
- [ ] Authentication errors handled
- [ ] Server errors show appropriate messages
- [ ] Timeout handling works

## 📊 Performance Testing

### Response Times
- [ ] API endpoints respond < 500ms
- [ ] Audio upload reasonable for file size
- [ ] UI remains responsive during operations
- [ ] Memory usage stays reasonable

### Concurrent Operations
- [ ] Multiple uploads work simultaneously
- [ ] WebSocket handles multiple connections
- [ ] Database handles concurrent requests

## 🔒 Security Testing

### Authentication
- [ ] Invalid tokens rejected
- [ ] Expired tokens handled
- [ ] Cross-user data access prevented
- [ ] Session hijacking prevented

### Data Validation
- [ ] Input sanitization working
- [ ] File type validation enforced
- [ ] SQL injection prevented
- [ ] XSS prevention in place

## 📱 Platform-Specific Testing

### iOS
- [ ] Runs on iOS 13+
- [ ] Apple Sign-In works
- [ ] In-app purchases work
- [ ] Push notifications work (if implemented)
- [ ] Background tasks work

### Android
- [ ] Runs on Android 5.0+
- [ ] Apple Sign-In works via web
- [ ] Audio recording works
- [ ] Background upload works
- [ ] App permissions handled correctly

## 🐛 Bug Reporting

When reporting issues, include:
1. Device/OS version
2. Steps to reproduce
3. Expected vs actual behavior
4. Screenshots/screen recordings
5. Relevant log output
6. Network conditions

## ✅ Sign-off Criteria

- [ ] All core features tested
- [ ] No critical bugs found
- [ ] Performance acceptable
- [ ] Security measures verified
- [ ] Documentation accurate
- [ ] Error handling appropriate

---

**Testing Environment Details:**
- Backend URL: _______________
- App Version: _______________
- Tester Name: _______________
- Test Date: _________________
- Device(s): _________________ 