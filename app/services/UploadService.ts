import { addToUploadQueue } from '../utils/backgroundUpload';

export class UploadService {
  async uploadAudio(conversationId: string, uris: string | string[]) {
    const files = Array.isArray(uris) ? uris : [uris];
    return Promise.all(files.map(uri => addToUploadQueue(conversationId, uri)));
  }
}