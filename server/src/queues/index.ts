import { Queue } from 'bullmq';
import { config } from '../config';
import { AudioJob, GptJob } from '../types';

export const audioQueue = new Queue<AudioJob>('audioProcessing', {
  connection: config.redis,
});
export const gptQueue = new Queue<GptJob>('gptProcessing', {
  connection: config.redis,
});
