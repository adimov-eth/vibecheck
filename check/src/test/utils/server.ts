import { createApp } from '../../api'
import type { Server } from 'http'

export async function startTestServer(port: number = 3001): Promise<Server> {
  const app = createApp()
  
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server as any)
    })
    
    server.on('error', reject)
  })
}