sequenceDiagram
    participant User
    participant App
    participant DeviceStorage
    participant Server
    participant ChatGPT

    User->>App: Open page
    activate App
    
    App->>App: Generate local conversation ID
    
    Note over User,App: User selects mode: "separate" or "live"
    
    alt Separate Mode
        User->>App: Click "Start recording" (first time)
        App->>App: Disable record button for 1.5s
        Note over App: pointer-events: none
        
        App->>Server: Create Conversation (mode="separate")
        activate Server
        Note over App,Server: Server now expects 2 files
        
        User->>App: Stop recording first audio
        App->>DeviceStorage: Save first audio file with local ID
        activate DeviceStorage
        DeviceStorage-->>App: First audio saved
        deactivate DeviceStorage
        
        Note over App: Queue first file for upload
        
        Server-->>App: Return server Conversation ID
        deactivate Server
        
        Note over App: Map local ID to server ID
        
        App->>Server: Upload first audio file
        activate Server
        Note over App,Server: First upload in progress
        
        User->>App: Click "Start recording" (second time)
        App->>App: Disable record button for 1.5s
        
        User->>App: Stop recording second audio
        App->>DeviceStorage: Save second audio file with same ID
        activate DeviceStorage
        DeviceStorage-->>App: Second audio saved
        deactivate DeviceStorage
        
        App->>Server: Upload second audio file
        Note over App,Server: Both uploads can happen concurrently
        
        Server-->>App: First upload complete
        Server-->>App: Second upload complete
        
    else Live Mode
        User->>App: Click "Start recording"
        App->>App: Disable record button for 1.5s
        Note over App: pointer-events: none
        
        App->>Server: Create Conversation (mode="live")
        activate Server
        Note over App,Server: Server now expects 1 file
        
        User->>App: Stop recording audio
        App->>DeviceStorage: Save audio file with local ID
        activate DeviceStorage
        DeviceStorage-->>App: Audio saved
        deactivate DeviceStorage
        
        Note over App: Queue file for upload
        
        Server-->>App: Return server Conversation ID
        deactivate Server
        
        Note over App: Map local ID to server ID
        
        App->>Server: Upload audio file
        activate Server
        
        Server-->>App: Upload complete
    end
    
    App->>App: Change view to next page
    App->>App: Show "processing" progress bar
    
    Server->>Server: Transcribe audio file(s)
    Server->>ChatGPT: Send transcription(s) in prompt
    activate ChatGPT
    
    ChatGPT-->>Server: Return response
    deactivate ChatGPT
    
    Server-->>App: Return processing results
    deactivate Server
    
    App->>App: Display results to user
    App->>DeviceStorage: Clean temporary audio files
    activate DeviceStorage
    DeviceStorage-->>App: Files cleaned
    deactivate DeviceStorage
    deactivate App
    
    User->>App: View results

# Audio Recording Application Flow Specification

## 1. Overview

This document specifies the complete flow for an audio recording application that supports two distinct operational modes:

- **Separate Mode**: User records two separate audio files which are processed together
- **Live Mode**: User records a single audio file for processing

Both modes share common infrastructure, API endpoints, and processing pipeline, with minor variations based on the selected mode.

## 2. Initialization and Setup

### 2.1 Page Load
- When user opens the application, the UI is initialized
- Application immediately generates a local conversation ID to ensure file association
- User selects either "separate" or "live" mode

### 2.2 UI Protection
- Record button becomes inactive (pointer-events: none) for 1.5 seconds after each click
- This prevents accidental double-clicks and ensures clean recording starts

## 3. Separate Mode Flow

### 3.1 First Recording
- User clicks "Start recording" button for the first time
- Application sends a request to create a new "Conversation" on the server
  - Request includes local conversation ID
  - Request specifies mode="separate" to indicate two files will be uploaded
- User records first audio content
- User clicks to stop first recording
- Application saves the first audio file to device storage with the local conversation ID

### 3.2 First Upload
- Application queues the first audio file for upload
- When server responds with server-side conversation ID:
  - Application maps local ID to server ID for future references
  - Upload of the first audio file begins
- First audio upload proceeds asynchronously

### 3.3 Second Recording
- User can start second recording without waiting for first upload to complete
- User clicks "Start recording" button for the second time
- User records second audio content
- User clicks to stop second recording
- Application saves the second audio file to device storage with the same conversation ID

### 3.4 Second Upload
- Application queues the second audio file for upload
- If server conversation ID is already received, upload begins immediately
- Otherwise, the file waits in queue until conversation ID is received
- Both files can upload concurrently if network conditions permit

### 3.5 Upload Completion
- Application tracks completion status of both uploads
- When both uploads are complete, UI transitions to next page

## 4. Live Mode Flow

### 4.1 Single Recording
- User clicks "Start recording" button
- Application sends a request to create a new "Conversation" on the server
  - Request includes local conversation ID
  - Request specifies mode="live" to indicate only one file will be uploaded
- User records audio content
- User clicks to stop recording
- Application saves the audio file to device storage with the local conversation ID

### 4.2 Upload
- Application queues the audio file for upload
- When server responds with server-side conversation ID:
  - Application maps local ID to server ID
  - Upload of the audio file begins
- When upload completes, UI transitions to next page

## 5. Server Processing

### 5.1 File Reception
- Server receives audio file(s) associated with the conversation ID
- Based on the mode:
  - Separate mode: Server waits for both files before processing
  - Live mode: Server processes after receiving the single file

### 5.2 Processing Pipeline
- Server transcribes all received audio files
- Transcriptions are wrapped in a prompt
- Prompt is sent to ChatGPT for processing
- Server awaits ChatGPT's response

### 5.3 Response Handling
- Server receives response from ChatGPT
- Server prepares final results for client
- Server sends processing results back to the application

## 6. Result Presentation and Cleanup

### 6.1 Result Display
- Application receives processing results from server
- "Processing" progress bar is replaced with results view
- Results are presented to the user in the appropriate format

### 6.2 Cleanup
- Application cleans temporary audio files from device storage
- User can view and interact with the final results

## 7. Error Handling and Edge Cases

### 7.1 Network Connectivity Issues
- If connection is lost during upload, application should retry when connectivity returns
- Local copies of audio files are preserved until successful upload confirmation

### 7.2 Partial Uploads
- Server should handle partial uploads correctly, awaiting all required files
- If a required file fails to upload after multiple attempts, appropriate error is shown

### 7.3 Session Management
- Conversation IDs remain valid for a reasonable time period
- If user leaves the application and returns, pending uploads should resume