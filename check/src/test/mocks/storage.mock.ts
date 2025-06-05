import { mock } from 'bun:test';
import { faker } from '@faker-js/faker';

export class MockStorageService {
  private files = new Map<string, Buffer>();
  
  uploadFile = mock(async (path: string, buffer: Buffer) => {
    this.files.set(path, buffer);
    return {
      success: true,
      path,
      url: `https://mock-storage.example.com/${path}`,
      size: buffer.length
    };
  });
  
  downloadFile = mock(async (path: string) => {
    const file = this.files.get(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  });
  
  deleteFile = mock(async (path: string) => {
    const existed = this.files.has(path);
    this.files.delete(path);
    return { success: existed };
  });
  
  getFileUrl = mock((path: string) => {
    if (!this.files.has(path)) {
      throw new Error(`File not found: ${path}`);
    }
    return `https://mock-storage.example.com/${path}`;
  });
  
  fileExists = mock(async (path: string) => {
    return this.files.has(path);
  });
  
  getFileSize = mock(async (path: string) => {
    const file = this.files.get(path);
    return file ? file.length : 0;
  });
  
  // Test helpers
  addMockFile(path: string, content: string | Buffer) {
    const buffer = typeof content === 'string' 
      ? Buffer.from(content) 
      : content;
    this.files.set(path, buffer);
  }
  
  createMockAudioFile(): Buffer {
    // Create a mock audio file buffer
    const size = faker.number.int({ min: 100000, max: 1000000 });
    return Buffer.alloc(size, 'mock-audio-data');
  }
  
  clear() {
    this.files.clear();
  }
  
  getStoredFiles() {
    return Array.from(this.files.keys());
  }
  
  reset() {
    this.uploadFile.mockReset();
    this.downloadFile.mockReset();
    this.deleteFile.mockReset();
    this.getFileUrl.mockReset();
    this.fileExists.mockReset();
    this.getFileSize.mockReset();
    this.clear();
  }
}

export const mockStorageService = new MockStorageService();