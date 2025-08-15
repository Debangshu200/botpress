#!/usr/bin/env node

/**
 * Interactive CLI for Knowledge-Enhanced Chat
 * Run with: npm run chat or node dist/chat-cli.js
 */

import * as readline from 'readline'
import { knowledgeEnhancedChat, ChatSession, ChatOptions } from './knowledge-enhanced-chat'

class ChatCLI {
  private rl: readline.Interface
  private session: ChatSession | null = null
  private options: ChatOptions

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '💬 You: '
    })

    this.options = {
      useKnowledgeBase: true,
      useLLMEnhancement: true,
      confidenceThreshold: 0.6,
      maxTokens: 600,
      temperature: 0.7,
      enableFallback: true,
      contextWindow: 5
    }

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.rl.on('line', async (input: string) => {
      const trimmed = input.trim()
      
      if (trimmed === '') {
        this.rl.prompt()
        return
      }

      // Handle special commands
      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed)
        this.rl.prompt()
        return
      }

      // Handle regular chat message
      if (!this.session) {
        console.log('❌ No active session. Starting new session...')
        this.session = knowledgeEnhancedChat.startSession('cli-user')
        console.log(`✅ Started session: ${this.session.id}`)
      }

      await this.sendMessage(trimmed)
      this.rl.prompt()
    })

    this.rl.on('close', () => {
      if (this.session) {
        knowledgeEnhancedChat.endSession(this.session.id)
      }
      console.log('\n👋 Goodbye! Thanks for using EventTitan Chat!')
      process.exit(0)
    })
  }

  private async sendMessage(message: string): Promise<void> {
    if (!this.session) return

    console.log('\n🤖 Thinking...')
    
    try {
      const startTime = Date.now()
      const result = await knowledgeEnhancedChat.sendMessage(
        this.session.id, 
        message, 
        this.options
      )

      if (result.success && result.botResponse) {
        const processingTime = Date.now() - startTime
        
        console.log('\n' + '='.repeat(80))
        console.log('🤖 EventTitan:')
        console.log('='.repeat(80))
        console.log(result.botResponse.content)
        console.log('='.repeat(80))
        
        // Show metadata if available
        if (result.botResponse.metadata) {
          const meta = result.botResponse.metadata
          console.log(`📊 Response Info: ${meta.source} | Confidence: ${(meta.confidence || 0 * 100).toFixed(1)}% | Quality: ${(meta.qualityScore || 0 * 100).toFixed(1)}% | Tokens: ${meta.tokensUsed || 0} | Time: ${processingTime}ms`)
        }
        
        console.log(`💬 Messages: ${result.sessionInfo.messageCount} | Knowledge: ${result.sessionInfo.knowledgeStats.uploadedDocuments} docs`)
        console.log('')
      } else {
        console.log(`❌ Error: ${result.error}`)
      }
    } catch (error) {
      console.log(`❌ Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ')

    switch (cmd.toLowerCase()) {
      case 'help':
        this.showHelp()
        break

      case 'new':
      case 'start':
        this.session = knowledgeEnhancedChat.startSession('cli-user')
        console.log(`✅ Started new session: ${this.session.id}`)
        break

      case 'history':
        this.showHistory()
        break

      case 'stats':
        this.showStats()
        break

      case 'config':
        this.showConfig()
        break

      case 'knowledge':
        await this.toggleKnowledge()
        break

      case 'llm':
        await this.toggleLLM()
        break

      case 'confidence':
        this.setConfidence(args[0])
        break

      case 'temp':
      case 'temperature':
        this.setTemperature(args[0])
        break

      case 'tokens':
        this.setMaxTokens(args[0])
        break

      case 'sessions':
        this.showSessions()
        break

      case 'clear':
        console.clear()
        break

      case 'quit':
      case 'exit':
        this.rl.close()
        break

      default:
        console.log(`❌ Unknown command: ${cmd}. Type /help for available commands.`)
    }
  }

  private showHelp(): void {
    console.log(`
📖 **EventTitan Chat Commands:**

**Chat Commands:**
  /new, /start          Start a new chat session
  /history             Show current session chat history
  /clear               Clear the screen
  /quit, /exit         Exit the chat

**Configuration:**
  /config              Show current configuration
  /knowledge           Toggle knowledge base usage
  /llm                 Toggle LLM enhancement
  /confidence <0-1>    Set confidence threshold (e.g., /confidence 0.7)
  /temp <0-2>          Set LLM temperature (e.g., /temp 0.8)
  /tokens <number>     Set max tokens (e.g., /tokens 800)

**Information:**
  /stats               Show chat and system statistics
  /sessions            Show active sessions
  /help                Show this help message

**Tips:**
• Just type your question to chat normally
• Use specific event planning terms for better results
• Ask follow-up questions to get more detailed information
• The bot has knowledge about venues, catering, budgets, and more!
`)
  }

  private showHistory(): void {
    if (!this.session) {
      console.log('❌ No active session')
      return
    }

    const history = knowledgeEnhancedChat.getChatHistory(this.session.id)
    console.log(`\n📜 **Chat History (${history.length} messages):**\n`)

    for (const msg of history) {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString()
      const icon = msg.type === 'user' ? '👤' : msg.type === 'bot' ? '🤖' : '🔧'
      const prefix = `${icon} [${timestamp}]`
      
      if (msg.content.length > 100) {
        console.log(`${prefix} ${msg.content.substring(0, 100)}...`)
      } else {
        console.log(`${prefix} ${msg.content}`)
      }
    }
    console.log('')
  }

  private showStats(): void {
    const stats = knowledgeEnhancedChat.getStatistics()
    
    console.log(`
📊 **System Statistics:**

**Chat Stats:**
• Total Sessions: ${stats.totalSessions}
• Active Sessions: ${stats.activeSessions}
• Total Messages: ${stats.totalMessages}

**Knowledge Base:**
• Uploaded Documents: ${stats.knowledgeStats.uploadedDocuments}
• Fallback Topics: ${stats.knowledgeStats.fallbackTopics}
• Total Size: ${stats.knowledgeStats.totalSize}

**GPT-OSS-20B Service:**
• Model: ${stats.serviceStatus.modelName}
• Configured: ${stats.serviceStatus.isConfigured ? '✅' : '❌'}
• Cache Size: ${stats.serviceStatus.cacheStatus.size}/${stats.serviceStatus.cacheStatus.maxSize}
• Failures: ${stats.serviceStatus.failureStatus.count}
`)
  }

  private showConfig(): void {
    console.log(`
⚙️  **Current Configuration:**

• Knowledge Base: ${this.options.useKnowledgeBase ? '✅ Enabled' : '❌ Disabled'}
• LLM Enhancement: ${this.options.useLLMEnhancement ? '✅ Enabled' : '❌ Disabled'}
• Confidence Threshold: ${this.options.confidenceThreshold}
• Max Tokens: ${this.options.maxTokens}
• Temperature: ${this.options.temperature}
• Fallback: ${this.options.enableFallback ? '✅ Enabled' : '❌ Disabled'}
• Context Window: ${this.options.contextWindow} messages
`)
  }

  private async toggleKnowledge(): Promise<void> {
    this.options.useKnowledgeBase = !this.options.useKnowledgeBase
    console.log(`🔄 Knowledge base ${this.options.useKnowledgeBase ? 'enabled' : 'disabled'}`)
  }

  private async toggleLLM(): Promise<void> {
    this.options.useLLMEnhancement = !this.options.useLLMEnhancement
    console.log(`🔄 LLM enhancement ${this.options.useLLMEnhancement ? 'enabled' : 'disabled'}`)
  }

  private setConfidence(value: string): void {
    const confidence = parseFloat(value)
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      console.log('❌ Confidence must be a number between 0 and 1')
      return
    }
    this.options.confidenceThreshold = confidence
    console.log(`✅ Confidence threshold set to ${confidence}`)
  }

  private setTemperature(value: string): void {
    const temp = parseFloat(value)
    if (isNaN(temp) || temp < 0 || temp > 2) {
      console.log('❌ Temperature must be a number between 0 and 2')
      return
    }
    this.options.temperature = temp
    console.log(`✅ Temperature set to ${temp}`)
  }

  private setMaxTokens(value: string): void {
    const tokens = parseInt(value)
    if (isNaN(tokens) || tokens < 50 || tokens > 2000) {
      console.log('❌ Max tokens must be a number between 50 and 2000')
      return
    }
    this.options.maxTokens = tokens
    console.log(`✅ Max tokens set to ${tokens}`)
  }

  private showSessions(): void {
    const sessions = knowledgeEnhancedChat.getActiveSessions()
    
    if (sessions.length === 0) {
      console.log('📭 No active sessions')
      return
    }

    console.log(`\n📋 **Active Sessions (${sessions.length}):**\n`)
    
    for (const session of sessions) {
      const startTime = new Date(session.startTime).toLocaleString()
      const lastActivity = new Date(session.lastActivity).toLocaleString()
      const current = this.session?.id === session.id ? ' (current)' : ''
      
      console.log(`🔗 ${session.id}${current}`)
      console.log(`   Started: ${startTime}`)
      console.log(`   Last Activity: ${lastActivity}`)
      console.log(`   Messages: ${session.messageCount}`)
      console.log('')
    }
  }

  public start(): void {
    console.log(`
🎉 **Welcome to EventTitan Knowledge Chat!**

Type your event planning questions or use commands starting with /
Type /help for available commands or /quit to exit

Starting new chat session...
`)

    // Start initial session
    this.session = knowledgeEnhancedChat.startSession('cli-user')
    console.log(`✅ Session started: ${this.session.id}\n`)

    this.rl.prompt()
  }
}

// Start the CLI if this file is run directly
if (require.main === module) {
  const cli = new ChatCLI()
  cli.start()
}

export { ChatCLI }