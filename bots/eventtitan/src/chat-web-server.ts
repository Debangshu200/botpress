#!/usr/bin/env node

/**
 * Simple web server for Knowledge-Enhanced Chat
 * Provides a basic web interface for the chat system
 */

import * as http from 'http'
import * as url from 'url'
import { knowledgeEnhancedChat, ChatSession } from './knowledge-enhanced-chat'

interface WebChatSession extends ChatSession {
  lastPing: number
}

class ChatWebServer {
  private server: http.Server
  private port: number
  private sessions: Map<string, WebChatSession>

  constructor(port: number = 3001) {
    this.port = port
    this.sessions = new Map()
    this.server = http.createServer(this.handleRequest.bind(this))
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const pathname = parsedUrl.pathname

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    try {
      switch (pathname) {
        case '/':
          this.serveHomePage(res)
          break
        case '/api/session/start':
          await this.handleStartSession(req, res)
          break
        case '/api/message/send':
          await this.handleSendMessage(req, res)
          break
        case '/api/session/history':
          await this.handleGetHistory(req, res, parsedUrl.query)
          break
        case '/api/stats':
          await this.handleGetStats(req, res)
          break
        default:
          this.send404(res)
      }
    } catch (error) {
      console.error('Server error:', error)
      this.sendError(res, 500, 'Internal server error')
    }
  }

  private serveHomePage(res: http.ServerResponse): void {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EventTitan Knowledge Chat</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .chat-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 90%;
            max-width: 800px;
            height: 80vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .chat-header {
            background: #4f46e5;
            color: white;
            padding: 20px;
            text-align: center;
        }
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f8fafc;
        }
        .message {
            margin-bottom: 15px;
            padding: 12px 16px;
            border-radius: 8px;
            max-width: 80%;
        }
        .message.user {
            background: #4f46e5;
            color: white;
            margin-left: auto;
        }
        .message.bot {
            background: white;
            border: 1px solid #e2e8f0;
        }
        .message.system {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            text-align: center;
            max-width: 100%;
        }
        .message-meta {
            font-size: 0.75rem;
            opacity: 0.7;
            margin-top: 5px;
        }
        .chat-input {
            display: flex;
            padding: 20px;
            background: white;
            border-top: 1px solid #e2e8f0;
        }
        .chat-input input {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 16px;
        }
        .chat-input button {
            margin-left: 10px;
            padding: 12px 24px;
            background: #4f46e5;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
        }
        .chat-input button:hover {
            background: #4338ca;
        }
        .chat-input button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
        }
        .status {
            padding: 10px 20px;
            background: #f1f5f9;
            border-top: 1px solid #e2e8f0;
            font-size: 0.875rem;
            color: #64748b;
        }
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
            color: #64748b;
        }
        .error {
            background: #fef2f2;
            color: #dc2626;
            padding: 10px;
            border-radius: 6px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1>🎉 EventTitan Knowledge Chat</h1>
            <p>Your AI assistant for event planning questions</p>
        </div>
        
        <div class="chat-messages" id="messages">
            <div class="loading" id="loading">Starting chat session...</div>
        </div>
        
        <div class="status" id="status">
            Ready to chat
        </div>
        
        <div class="chat-input">
            <input type="text" id="messageInput" placeholder="Ask me about event planning..." disabled>
            <button id="sendButton" onclick="sendMessage()" disabled>Send</button>
        </div>
    </div>

    <script>
        let sessionId = null;
        let messageCount = 0;

        async function startSession() {
            try {
                document.getElementById('loading').style.display = 'block';
                
                const response = await fetch('/api/session/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: 'web-user' })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    sessionId = data.session.id;
                    document.getElementById('messageInput').disabled = false;
                    document.getElementById('sendButton').disabled = false;
                    updateStatus('Session started - Ready to chat!');
                    loadHistory();
                } else {
                    showError('Failed to start session: ' + data.error);
                }
            } catch (error) {
                showError('Connection error: ' + error.message);
            } finally {
                document.getElementById('loading').style.display = 'none';
            }
        }

        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (!message || !sessionId) return;
            
            input.value = '';
            input.disabled = true;
            document.getElementById('sendButton').disabled = true;
            
            // Add user message immediately
            addMessage('user', message);
            updateStatus('Thinking...');
            
            try {
                const response = await fetch('/api/message/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        message: message,
                        options: {
                            useKnowledgeBase: true,
                            useLLMEnhancement: true
                        }
                    })
                });
                
                const data = await response.json();
                
                if (data.success && data.botResponse) {
                    addMessage('bot', data.botResponse.content, data.botResponse.metadata);
                    messageCount = data.sessionInfo.messageCount;
                    updateStatus(\`Messages: \${messageCount} | Knowledge: \${data.sessionInfo.knowledgeStats.uploadedDocuments} docs\`);
                } else {
                    showError('Failed to send message: ' + data.error);
                }
            } catch (error) {
                showError('Connection error: ' + error.message);
            } finally {
                input.disabled = false;
                document.getElementById('sendButton').disabled = false;
                input.focus();
            }
        }

        async function loadHistory() {
            try {
                const response = await fetch(\`/api/session/history?sessionId=\${sessionId}\`);
                const data = await response.json();
                
                if (data.success) {
                    const messagesDiv = document.getElementById('messages');
                    messagesDiv.innerHTML = '';
                    
                    data.messages.forEach(msg => {
                        addMessage(msg.type, msg.content, msg.metadata, false);
                    });
                }
            } catch (error) {
                console.error('Failed to load history:', error);
            }
        }

        function addMessage(type, content, metadata = null, scroll = true) {
            const messagesDiv = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${type}\`;
            
            let metaText = '';
            if (metadata) {
                const confidence = metadata.confidence ? (metadata.confidence * 100).toFixed(1) : 0;
                const quality = metadata.qualityScore ? (metadata.qualityScore * 100).toFixed(1) : 0;
                metaText = \`<div class="message-meta">Source: \${metadata.source} | Confidence: \${confidence}% | Quality: \${quality}% | Tokens: \${metadata.tokensUsed || 0}</div>\`;
            }
            
            messageDiv.innerHTML = \`
                <div>\${content.replace(/\\n/g, '<br>')}</div>
                \${metaText}
            \`;
            
            messagesDiv.appendChild(messageDiv);
            
            if (scroll) {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        }

        function updateStatus(text) {
            document.getElementById('status').textContent = text;
        }

        function showError(message) {
            const messagesDiv = document.getElementById('messages');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error';
            errorDiv.textContent = message;
            messagesDiv.appendChild(errorDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        // Event listeners
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        // Start session when page loads
        window.onload = startSession;
    </script>
</body>
</html>`

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  }

  private async handleStartSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      this.sendError(res, 405, 'Method not allowed')
      return
    }

    try {
      const body = await this.getRequestBody(req)
      const { userId } = JSON.parse(body)

      const session = knowledgeEnhancedChat.startSession(userId || 'web-user')
      const webSession: WebChatSession = {
        ...session,
        lastPing: Date.now()
      }

      this.sessions.set(session.id, webSession)

      this.sendJSON(res, {
        success: true,
        session: {
          id: session.id,
          userId: session.userId,
          startTime: session.startTime
        }
      })
    } catch (error) {
      this.sendError(res, 400, 'Invalid request body')
    }
  }

  private async handleSendMessage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      this.sendError(res, 405, 'Method not allowed')
      return
    }

    try {
      const body = await this.getRequestBody(req)
      const { sessionId, message, options } = JSON.parse(body)

      if (!sessionId || !message) {
        this.sendError(res, 400, 'Missing sessionId or message')
        return
      }

      const webSession = this.sessions.get(sessionId)
      if (webSession) {
        webSession.lastPing = Date.now()
      }

      const result = await knowledgeEnhancedChat.sendMessage(sessionId, message, options)

      this.sendJSON(res, result)
    } catch (error) {
      this.sendError(res, 400, 'Invalid request body')
    }
  }

  private async handleGetHistory(req: http.IncomingMessage, res: http.ServerResponse, query: any): Promise<void> {
    const sessionId = query.sessionId as string

    if (!sessionId) {
      this.sendError(res, 400, 'Missing sessionId')
      return
    }

    try {
      const messages = knowledgeEnhancedChat.getChatHistory(sessionId)
      this.sendJSON(res, {
        success: true,
        messages
      })
    } catch (error) {
      this.sendError(res, 500, 'Failed to get history')
    }
  }

  private async handleGetStats(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const stats = knowledgeEnhancedChat.getStatistics()
      this.sendJSON(res, {
        success: true,
        stats
      })
    } catch (error) {
      this.sendError(res, 500, 'Failed to get stats')
    }
  }

  private async getRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })
      req.on('end', () => {
        resolve(body)
      })
      req.on('error', reject)
    })
  }

  private sendJSON(res: http.ServerResponse, data: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  private sendError(res: http.ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: false, error: message }))
  }

  private send404(res: http.ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`🌐 EventTitan Chat Web Server running at:`)
      console.log(`   http://localhost:${this.port}`)
      console.log(`\n💡 Open the URL in your browser to start chatting!`)
      console.log(`\n🔧 API Endpoints:`)
      console.log(`   POST /api/session/start - Start new session`)
      console.log(`   POST /api/message/send - Send message`)
      console.log(`   GET /api/session/history?sessionId=... - Get history`)
      console.log(`   GET /api/stats - Get statistics`)
    })

    // Cleanup old sessions every 5 minutes
    setInterval(() => {
      const now = Date.now()
      const maxAge = 30 * 60 * 1000 // 30 minutes

      for (const [sessionId, session] of this.sessions.entries()) {
        if (now - session.lastPing > maxAge) {
          this.sessions.delete(sessionId)
          knowledgeEnhancedChat.endSession(sessionId)
        }
      }
    }, 5 * 60 * 1000)
  }

  public stop(): void {
    this.server.close()
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const port = parseInt(process.argv[2]) || 3001
  const server = new ChatWebServer(port)
  server.start()

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down web server...')
    server.stop()
    process.exit(0)
  })
}

export { ChatWebServer }