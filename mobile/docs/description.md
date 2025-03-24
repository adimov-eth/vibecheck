

Partner Position Recording Flow User taps on any mode tile
Navigation to recording screen
First partner records position
Position 1 is sent to backend for processing in background
Second partner records position
Analyze button becomes active after both positions are recorded
Request is processed by AI assistant on the backend
Results are returned to applicationLiveMod Feature 
Separate functionality
No distinction between first and second partner
Partners discuss within a single recording
Users can switch between separate and live modes after they chosen assistant type.Technical Implementation Notes
Backend is already configured for background processing
App supports both audio
Processing occurs while second partner records


Vibecheck: Harmonize Your Relationship with AI
SummaryVibecheck is an innovative mobile app designed specifically for couples who want to resolve conflicts and reach mutually satisfying decisions. By leveraging AI technology, the app helps partners articulate their perspectives and receive objective, balanced suggestions to harmonize their arguments.
Detailed DescriptionVibecheck is a full‑stack mobile solution that empowers couples to manage and resolve disagreements effectively. Conversation Modes:Mediator: For resolving disagreements with balanced insights
Counselor: For deeper relationship insights and growth opportunities
Dinner Planner: For quick food decisions when you can't agree
Movie Night: For finding entertainment you'll both enjoy

The app offers two distinct modes to capture and analyze conversations:
    •    Separate Mode: In this mode, each partner can record their perspective individually. This allows for honest and unfiltered input without interruption. The app stores each audio recording securely and later processes them independently before synthesizing the insights.
    •    Live Mode: Alternatively, live mode captures both voices simultaneously, mimicking a real-time conversation. This mode is ideal for spontaneous discussions where both partners need to express their thoughts in the moment.Vibecheck incorporates an intuitive audio recorder that allows couples to record their individual or live arguments. Clear indicators show which partner’s audio has been captured, ensuring that both sides are heard.Once the recordings are submitted, the app sends the audio data to a backend powered by advanced AI (utilizing OpenAI’s APIs). The AI transcribes and analyzes the conversation, offering insights into the tone, content, and key points raised by each partner.
    •    Progress Feedback: Users see real-time updates as the app processes the audio—transitioning through stages like “Processing audio,” “Transcribing,” “Analyzing,” and “Finalizing.”The AI generates a verdict or recommendation that aims to reconcile differences. Whether it’s suggesting a compromise, highlighting mutual interests, or offering a fresh perspective, the verdict is designed to help both partners move forward in a harmonious way.Vibecheck may include subscription-based features that offer advanced analysis, additional insights, or personalized counseling tips. If users exceed free usage limits or need premium functionality, a paywall modal guides them through subscription options.The app is built with a sleek, user-friendly interface using Expo and React Native, ensuring a smooth and engaging experience across platforms. From customizable audio recording controls to visually appealing progress indicators and results displays, every element is designed to enhance user satisfaction.
