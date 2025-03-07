import React, { useState } from 'react';
import { Mic, ChevronLeft, Check, Loader, ArrowRight } from 'lucide-react';

// Main App component
const VibeCheckApp = () => {
  const [screen, setScreen] = useState('home');
  const [selectedMode, setSelectedMode] = useState(null);
  const [recordMode, setRecordMode] = useState('separate');
  const [currentPartner, setCurrentPartner] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [partner1Data, setPartner1Data] = useState(null);
  const [partner2Data, setPartner2Data] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);

  // Mode options
  const modes = [
    {
      id: 'mediator',
      title: 'Mediator',
      description: 'Get balanced insights',
      icon: '⚖️',
      color: 'bg-green-400'
    },
    {
      id: 'whosRight',
      title: 'Who\'s Right',
      description: 'Get a clear verdict',
      icon: '🔨',
      color: 'bg-blue-500'
    },
    {
      id: 'dinner',
      title: 'Dinner Planner',
      description: 'Decide what to eat',
      icon: '🍽️',
      color: 'bg-sky-400'
    },
    {
      id: 'movie',
      title: 'Movie Night',
      description: 'Find something to watch',
      icon: '📺',
      color: 'bg-orange-400'
    }
  ];

  // Handle mode selection
  const selectMode = (mode) => {
    setSelectedMode(mode);
    setScreen('recording');
    resetRecording();
  };

  // Reset recording state
  const resetRecording = () => {
    setCurrentPartner(1);
    setPartner1Data(null);
    setPartner2Data(null);
    setIsRecording(false);
  };

  // Toggle recording
  const toggleRecording = () => {
    if (!isRecording) {
      // Start recording
      setIsRecording(true);
    } else {
      // Stop recording
      setIsRecording(false);
      
      // Save recording data
      if (currentPartner === 1) {
        // Simulate recording data for Partner 1
        setPartner1Data('Partner 1 audio data');
        
        // Proceed to Partner 2 if in separate mode
        if (recordMode === 'separate') {
          setCurrentPartner(2);
          
          // Simulate background processing
          console.log('Processing Partner 1 data in background');
        } else {
          // In live mode, we finish after one recording
          processResults();
        }
      } else {
        // Save Partner 2 data and process results
        setPartner2Data('Partner 2 audio data');
        processResults();
      }
    }
  };

  // Process results
  const processResults = () => {
    setIsProcessing(true);
    setScreen('results');
    
    // Simulate API call delay
    setTimeout(() => {
      setResults({
        title: `${selectedMode.title} Results`,
        content: `Analysis based on ${recordMode === 'separate' ? 'both partners' : 'live conversation'}.`,
        suggestions: [
          'Suggestion 1: Find common ground on key issues',
          'Suggestion 2: Consider scheduling a follow-up conversation',
          'Suggestion 3: Focus on specific actionable items'
        ]
      });
      setIsProcessing(false);
    }, 2000);
  };

  // Render Home Screen
  const renderHomeScreen = () => (
    <div className="flex flex-col h-full">
      <div className="text-center pt-10 pb-6">
        <h1 className="text-3xl font-bold mb-2">VibeCheck</h1>
        <p className="text-gray-500">An objective 3rd party to help you settle whatever needs settling</p>
      </div>
      
      <div className="flex flex-col space-y-4 px-4 flex-grow">
        {modes.map(mode => (
          <button
            key={mode.id}
            className="flex items-center p-4 bg-white rounded-xl border border-gray-100 shadow-sm"
            onClick={() => selectMode(mode)}
          >
            <div className={`${mode.color} w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl`}>
              <span className="text-2xl">{mode.icon}</span>
            </div>
            <div className="ml-4 text-left">
              <h3 className="text-xl font-semibold">{mode.title}</h3>
              <p className="text-gray-500">{mode.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // Render Recording Screen
  const renderRecordingScreen = () => (
    <div className="flex flex-col h-full">
      <div className="text-center pt-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">VibeCheck</h1>
        <p className="text-gray-500">An objective 3rd party to help you settle whatever needs settling</p>
      </div>
      
      <div className="px-4 py-2">
        <button className="flex items-center text-gray-600" onClick={() => setScreen('home')}>
          <ChevronLeft size={20} />
          <span>Select type</span>
        </button>
      </div>
      
      {selectedMode && (
        <div className="mx-4 my-2 p-4 bg-white rounded-xl border border-gray-100">
          <div className="flex items-center">
            <div className={`${selectedMode.color} w-14 h-14 rounded-xl flex items-center justify-center text-white`}>
              <span className="text-2xl">{selectedMode.icon}</span>
            </div>
            <div className="ml-4">
              <h3 className="text-xl font-semibold">{selectedMode.title}</h3>
              <p className="text-gray-500">{selectedMode.description}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="border-t border-gray-200 mt-4"></div>
      
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">Mode</span>
          <span className="bg-gray-200 text-gray-600 rounded-full w-5 h-5 flex items-center justify-center text-xs">i</span>
        </div>
        
        <div className="flex bg-gray-100 rounded-full p-1">
          <button 
            className={`px-4 py-2 rounded-full ${recordMode === 'separate' ? 'bg-white shadow-sm' : ''}`}
            onClick={() => setRecordMode('separate')}
          >
            Separate
          </button>
          <button 
            className={`px-4 py-2 rounded-full ${recordMode === 'live' ? 'bg-gray-700 text-white' : ''}`}
            onClick={() => setRecordMode('live')}
          >
            Live
          </button>
        </div>
      </div>
      
      <div className="flex-grow flex flex-col items-center justify-center px-4">
        {recordMode === 'separate' && (
          <div className="text-xl font-semibold mb-6">
            Partner {currentPartner}
          </div>
        )}
        
        <button 
          className={`w-20 h-20 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500' : 'bg-blue-500'} text-white`}
          onClick={toggleRecording}
        >
          <Mic size={40} />
        </button>
        
        <div className="mt-4 text-gray-600">
          {isRecording ? 'Recording... Tap to stop' : 'Tap to start recording'}
        </div>
        
        {recordMode === 'separate' && currentPartner === 1 && partner1Data && (
          <div className="mt-6 flex items-center text-green-500">
            <Check size={20} />
            <span className="ml-2">Partner 1 recorded</span>
          </div>
        )}
      </div>
    </div>
  );

  // Render Results Screen
  const renderResultsScreen = () => (
    <div className="flex flex-col h-full">
      <div className="text-center pt-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">VibeCheck</h1>
        <p className="text-gray-500">An objective 3rd party to help you settle whatever needs settling</p>
      </div>
      
      <div className="px-4 py-2">
        <button className="flex items-center text-gray-600" onClick={() => setScreen('home')}>
          <ChevronLeft size={20} />
          <span>Back to home</span>
        </button>
      </div>
      
      <div className="flex-grow flex flex-col p-4">
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin">
              <Loader size={40} className="text-blue-500" />
            </div>
            <p className="mt-4 text-gray-600">Analyzing your conversation...</p>
          </div>
        ) : (
          results && (
            <>
              <h2 className="text-2xl font-bold mb-4">{results.title}</h2>
              <p className="mb-6">{results.content}</p>
              
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
                <h3 className="font-semibold mb-2">Suggestions</h3>
                <ul className="space-y-2">
                  {results.suggestions.map((suggestion, index) => (
                    <li key={index} className="flex">
                      <ArrowRight size={18} className="text-blue-500 mr-2 flex-shrink-0 mt-1" />
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );

  // Render the appropriate screen
  return (
    <div className="bg-gray-50 min-h-screen max-w-md mx-auto">
      {screen === 'home' && renderHomeScreen()}
      {screen === 'recording' && renderRecordingScreen()}
      {screen === 'results' && renderResultsScreen()}
    </div>
  );
};

export default VibeCheckApp;