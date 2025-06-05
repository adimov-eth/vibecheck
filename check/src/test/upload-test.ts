// Test audio upload directly
import { createApp } from '../api';

const app = createApp();
const server = app.listen(3999, () => {
  console.log('Test server running on port 3999');
});

// Test upload
async function testUpload() {
  const formData = new FormData();
  formData.append('conversationId', 'test-12345');
  formData.append('audio', new Blob([Buffer.from('fake audio data')], { type: 'audio/webm' }), 'test.webm');
  
  const response = await fetch('http://localhost:3999/audio/upload', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer fake-token'
    },
    body: formData
  });
  
  console.log('Response status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
  
  server.close();
}

setTimeout(testUpload, 100);