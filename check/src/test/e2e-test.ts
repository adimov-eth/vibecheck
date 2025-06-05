// Quick test to debug form data
import { Blob } from 'buffer';

const formData = new FormData();
formData.append('conversationId', '12345');
formData.append('audio', new Blob([Buffer.from('test')], { type: 'audio/webm' }), 'test.webm');

// Log what FormData contains
for (const [key, value] of formData) {
  console.log(key, value);
}

console.log('FormData entries:', Array.from(formData.entries()).map(([k, v]) => [k, typeof v]));