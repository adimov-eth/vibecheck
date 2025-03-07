import { db } from '../database';
import { audios, conversations } from '../database/schema';
import { eq } from 'drizzle-orm';
import { generateGptResponse } from '../utils/openai.utils';
import { log } from '../utils/logger.utils';
import { config } from '../config';
import { Worker, Job } from 'bullmq';

const SYSTEM_PROMPTS = {
  mediator: {
    separate:
      'You are an impartial mediator for a couple’s disagreement. Listen to both partners’ perspectives, then provide balanced insights to resolve the conflict. Pick a clear winner only if one side is undeniably right; otherwise, suggest a fair compromise. Start with your verdict or compromise, then explain. Keep responses under 150 words.',
    live: 'You are an impartial mediator for a couple’s disagreement. Analyze the following conversation between two partners and provide balanced insights to resolve the conflict. Pick a clear winner only if one side is undeniably right; otherwise, suggest a fair compromise. Start with your verdict or compromise, then explain. Keep responses under 150 words.',
  },
  counselor: {
    separate:
      'You are a relationship counselor offering deep insights for growth. Analyze both partners’ perspectives, identify underlying issues, and propose a resolution that fosters understanding and harmony. Focus on common ground and personal growth opportunities. Keep responses concise, under 300 words.',
    live: 'You are a relationship counselor offering deep insights for growth. Analyze the following conversation between two partners, identify underlying issues, and propose a resolution that fosters understanding and harmony. Focus on common ground and personal growth opportunities. Keep responses concise, under 300 words.',
  },
  dinner: {
    separate:
      'You are a decisive meal planner for a couple who can’t agree on food. Analyze each partner’s preferences, then recommend a specific cuisine and 2-3 dishes that satisfy both. Start with your recommendation, then justify it based on their input. Keep responses under 100 words.',
    live: 'You are a decisive meal planner for a couple who can’t agree on food. Analyze their discussion, then recommend a specific cuisine and 2-3 dishes that satisfy both. Start with your recommendation, then justify it based on their input. Keep responses under 100 words.',
  },
  movie: {
    separate:
      'You are an entertainment recommender for a couple. Analyze their preferences, then suggest one specific movie or show you’re confident they’ll both enjoy. Start with your pick, then explain why it fits. Keep responses under 150 words.',
    live: 'You are an entertainment recommender for a couple. Analyze their discussion, then suggest one specific movie or show you’re confident they’ll both enjoy. Start with your pick, then explain why it fits. Keep responses under 150 words.',
  },
};
const createPrompt = (
  mode: string,
  recordingType: string,
  transcriptions: string[]
) => {
  const systemPrompt =
    SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS][
      recordingType as 'separate' | 'live'
    ];
  if (!systemPrompt)
    throw new Error(
      `Invalid mode or recording type: ${mode}, ${recordingType}`
    );
  return recordingType === 'separate'
    ? `${systemPrompt}\n\nPartner 1: ${transcriptions[0]}\nPartner 2: ${transcriptions[1]}`
    : `${systemPrompt}\n\nConversation: ${transcriptions[0]}`;
};

const worker = new Worker(
  'gptProcessing',
  async (job: Job) => {
    const { conversationId } = job.data;

    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .then(r => r[0]);
    if (!conversation) throw new Error('Conversation not found');

    const conversationAudios = await db
      .select()
      .from(audios)
      .where(eq(audios.conversationId, conversationId));
    const transcriptions = conversationAudios.map(a => a.transcription!);

    if (
      conversation.recordingType === 'separate' &&
      conversationAudios.length !== 2
    ) {
      throw new Error('Expected two audios for separate mode');
    }
    if (
      conversation.recordingType === 'live' &&
      conversationAudios.length !== 1
    ) {
      throw new Error('Expected one audio for live mode');
    }

    const prompt = createPrompt(
      conversation.mode,
      conversation.recordingType,
      transcriptions
    );
    const gptResponse = await generateGptResponse(prompt);
    console.log('GPT response:', gptResponse);
    await db
      .update(conversations)
      .set({ gptResponse, status: 'completed' })
      .where(eq(conversations.id, conversationId));
  },
  { connection: config.redis }
);

worker.on('completed', (job: Job) => log(`GPT job ${job.id} completed`));
worker.on('failed', (job: Job | undefined, err: Error) =>
  log(`GPT job ${job?.id} failed: ${err.message}`, 'error')
);

export default worker;
