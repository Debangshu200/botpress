import * as sdk from '@botpress/sdk'

// Types for conversation recording
export interface RecordedMessage {
  id: string
  timestamp: Date
  sender: 'user' | 'agent' | 'bot'
  content: string
  messageType: string
  metadata?: Record<string, any>
  piiFiltered: boolean
}

export interface ConversationRecord {
  sessionId: string
  conversationId: string
  hitlConversationId?: string
  startTime: Date
  endTime?: Date
  messages: RecordedMessage[]
  learningData: LearningData[]
  processed: boolean
  metadata: RecordingMetadata
}

export interface LearningData {
  queryId: string
  query: string
  response: string
  confidence: number
  source: 'human-agent'
  timestamp: Date
  quality: 'pending' | 'approved' | 'rejected'
  metadata: LearningMetadata
}

export interface LearningMetadata {
  agentId?: string
  sessionDuration?: number
  messageCount: number
  queryComplexity?: 'simple' | 'moderate' | 'complex'
  responseQuality?: number
  userSatisfaction?: number
  tags: string[]
}

export interface RecordingMetadata {
  userId: string
  agentId?: string
  recordingEnabled: boolean
  privacyCompliant: boolean
  piiFilteringEnabled: boolean
  totalMessages: number
  filteredMessages: number
  recordingQuality: 'complete' | 'partial' | 'failed'
}

export interface PIIPattern {
  type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'address' | 'name' | 'custom'
  pattern: RegExp
  replacement: string
  confidence: number
}

export interface RecorderConfig {
  enabled: boolean
  piiFilteringEnabled: boolean
  maxRecordingDuration: number
  maxMessageCount: number
  storageRetentionDays: number
  privacyCompliant: boolean
  learningEnabled: boolean
}

/**
 * ConversationRecorder handles real-time message logging during HITL sessions
 * with privacy-compliant data capture and PII filtering
 */
export class ConversationRecorder {
  private activeRecordings: Map<string, ConversationRecord> = new Map()
  private config: RecorderConfig
  private piiPatterns: PIIPattern[]

  constructor(config: RecorderConfig) {
    this.config = config
    this.piiPatterns = this.initializePIIPatterns()
  }

  /**
   * Starts recording a conversation for a HITL session
   */
  startRecording(
    sessionId: string,
    conversationId: string,
    hitlConversationId?: string,
    userId?: string
  ): void {
    if (!this.config.enabled) {
      console.warn('ConversationRecorder: Recording is disabled')
      return
    }

    if (this.activeRecordings.has(sessionId)) {
      console.warn(`ConversationRecorder: Recording already active for session ${sessionId}`)
      return
    }

    const record: ConversationRecord = {
      sessionId,
      conversationId,
      hitlConversationId,
      startTime: new Date(),
      messages: [],
      learningData: [],
      processed: false,
      metadata: {
        userId: userId || 'unknown',
        recordingEnabled: true,
        privacyCompliant: this.config.privacyCompliant,
        piiFilteringEnabled: this.config.piiFilteringEnabled,
        totalMessages: 0,
        filteredMessages: 0,
        recordingQuality: 'complete'
      }
    }

    this.activeRecordings.set(sessionId, record)
    
    console.info(`ConversationRecorder: Started recording for session ${sessionId}`, {
      conversationId,
      hitlConversationId,
      privacyCompliant: this.config.privacyCompliant
    })
  }

  /**
   * Records a message during an active HITL session
   */
  recordMessage(
    sessionId: string,
    message: {
      id?: string
      sender: 'user' | 'agent' | 'bot'
      content: string
      messageType: string
      timestamp?: Date
      metadata?: Record<string, any>
    }
  ): void {
    const record = this.activeRecordings.get(sessionId)
    if (!record) {
      console.warn(`ConversationRecorder: No active recording for session ${sessionId}`)
      return
    }

    // Check recording limits
    if (record.messages.length >= this.config.maxMessageCount) {
      console.warn(`ConversationRecorder: Message limit reached for session ${sessionId}`)
      record.metadata.recordingQuality = 'partial'
      return
    }

    const sessionDuration = new Date().getTime() - record.startTime.getTime()
    if (sessionDuration > this.config.maxRecordingDuration) {
      console.warn(`ConversationRecorder: Recording duration limit reached for session ${sessionId}`)
      record.metadata.recordingQuality = 'partial'
      return
    }

    // Apply PII filtering if enabled
    let filteredContent = message.content
    let piiFiltered = false

    if (this.config.piiFilteringEnabled) {
      const filterResult = this.filterPII(message.content)
      filteredContent = filterResult.content
      piiFiltered = filterResult.filtered
      
      if (piiFiltered) {
        record.metadata.filteredMessages++
      }
    }

    // Create recorded message
    const recordedMessage: RecordedMessage = {
      id: message.id || this.generateMessageId(),
      timestamp: message.timestamp || new Date(),
      sender: message.sender,
      content: filteredContent,
      messageType: message.messageType,
      metadata: message.metadata,
      piiFiltered
    }

    // Add message to record
    record.messages.push(recordedMessage)
    record.metadata.totalMessages++

    console.debug(`ConversationRecorder: Recorded message for session ${sessionId}`, {
      sender: message.sender,
      messageType: message.messageType,
      piiFiltered,
      totalMessages: record.metadata.totalMessages
    })
  }

  /**
   * Stops recording and returns the conversation record
   */
  async stopRecording(sessionId: string): Promise<ConversationRecord | null> {
    const record = this.activeRecordings.get(sessionId)
    if (!record) {
      console.warn(`ConversationRecorder: No active recording for session ${sessionId}`)
      return null
    }

    // Finalize the recording
    record.endTime = new Date()
    
    // Calculate session metadata
    const sessionDuration = record.endTime.getTime() - record.startTime.getTime()
    record.metadata = {
      ...record.metadata,
      agentId: this.extractAgentId(record.messages),
      recordingQuality: this.assessRecordingQuality(record)
    }

    // Extract learning data if enabled
    if (this.config.learningEnabled) {
      try {
        record.learningData = await this.extractLearningData(record)
      } catch (error) {
        console.error(`ConversationRecorder: Error extracting learning data for session ${sessionId}:`, error)
      }
    }

    // Remove from active recordings
    this.activeRecordings.delete(sessionId)

    console.info(`ConversationRecorder: Stopped recording for session ${sessionId}`, {
      duration: sessionDuration,
      messageCount: record.messages.length,
      learningDataCount: record.learningData.length,
      recordingQuality: record.metadata.recordingQuality
    })

    return record
  }

  /**
   * Gets the current recording status for a session
   */
  getRecordingStatus(sessionId: string): {
    isRecording: boolean
    messageCount: number
    duration: number
    recordingQuality: string
  } | null {
    const record = this.activeRecordings.get(sessionId)
    if (!record) {
      return null
    }

    const duration = new Date().getTime() - record.startTime.getTime()
    
    return {
      isRecording: true,
      messageCount: record.messages.length,
      duration,
      recordingQuality: record.metadata.recordingQuality
    }
  }

  /**
   * Gets all active recording sessions
   */
  getActiveRecordings(): string[] {
    return Array.from(this.activeRecordings.keys())
  }

  /**
   * Extracts learning data from recorded conversation
   */
  async extractLearningData(record: ConversationRecord): Promise<LearningData[]> {
    const learningData: LearningData[] = []
    const messages = record.messages

    // Find query-response pairs
    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i]
      const nextMessage = messages[i + 1]

      // Look for user questions followed by agent responses
      if (currentMessage.sender === 'user' && nextMessage.sender === 'agent') {
        // Check if the user message is a question
        if (this.isQuestion(currentMessage.content)) {
          const learningItem: LearningData = {
            queryId: this.generateQueryId(),
            query: currentMessage.content,
            response: nextMessage.content,
            confidence: this.calculateResponseConfidence(currentMessage.content, nextMessage.content),
            source: 'human-agent',
            timestamp: nextMessage.timestamp,
            quality: 'pending',
            metadata: {
              agentId: record.metadata.agentId,
              sessionDuration: record.endTime ? 
                record.endTime.getTime() - record.startTime.getTime() : undefined,
              messageCount: record.messages.length,
              queryComplexity: this.assessQueryComplexity(currentMessage.content),
              responseQuality: this.assessResponseQuality(nextMessage.content),
              tags: this.extractTags(currentMessage.content, nextMessage.content)
            }
          }

          learningData.push(learningItem)
        }
      }
    }

    return learningData
  }

  // Private helper methods

  private initializePIIPatterns(): PIIPattern[] {
    return [
      {
        type: 'email',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '[EMAIL]',
        confidence: 0.95
      },
      {
        type: 'phone',
        pattern: /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
        replacement: '[PHONE]',
        confidence: 0.90
      },
      {
        type: 'ssn',
        pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        replacement: '[SSN]',
        confidence: 0.85
      },
      {
        type: 'credit_card',
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        replacement: '[CREDIT_CARD]',
        confidence: 0.90
      },
      {
        type: 'address',
        pattern: /\b\d+\s+[A-Za-z0-9\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl)\b/gi,
        replacement: '[ADDRESS]',
        confidence: 0.75
      }
    ]
  }

  private filterPII(content: string): { content: string; filtered: boolean } {
    let filteredContent = content
    let filtered = false

    for (const pattern of this.piiPatterns) {
      if (pattern.pattern.test(filteredContent)) {
        filteredContent = filteredContent.replace(pattern.pattern, pattern.replacement)
        filtered = true
      }
    }

    return { content: filteredContent, filtered }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  private generateQueryId(): string {
    return `query_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  private extractAgentId(messages: RecordedMessage[]): string | undefined {
    const agentMessage = messages.find(msg => msg.sender === 'agent')
    return agentMessage?.metadata?.agentId
  }

  private assessRecordingQuality(record: ConversationRecord): 'complete' | 'partial' | 'failed' {
    if (record.messages.length === 0) {
      return 'failed'
    }

    const hasUserMessages = record.messages.some(msg => msg.sender === 'user')
    const hasAgentMessages = record.messages.some(msg => msg.sender === 'agent')

    if (hasUserMessages && hasAgentMessages) {
      return record.metadata.recordingQuality || 'complete'
    }

    return 'partial'
  }

  private isQuestion(content: string): boolean {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did']
    const lowerContent = content.toLowerCase().trim()
    
    // Check for question mark
    if (lowerContent.endsWith('?')) {
      return true
    }

    // Check for question words at the beginning
    const firstWord = lowerContent.split(' ')[0]
    if (questionWords.includes(firstWord)) {
      return true
    }

    return false
  }

  private calculateResponseConfidence(query: string, response: string): number {
    // Simple confidence calculation based on response length and relevance
    const responseLength = response.length
    const queryLength = query.length

    // Base confidence on response completeness
    let confidence = Math.min(responseLength / 100, 1.0) * 0.5

    // Add confidence based on response-to-query ratio
    const ratio = responseLength / queryLength
    confidence += Math.min(ratio / 3, 0.3)

    // Add confidence if response contains specific indicators
    if (response.includes('here') || response.includes('you can') || response.includes('try')) {
      confidence += 0.2
    }

    return Math.min(confidence, 1.0)
  }

  private assessQueryComplexity(query: string): 'simple' | 'moderate' | 'complex' {
    const wordCount = query.split(' ').length
    const hasMultipleQuestions = (query.match(/\?/g) || []).length > 1
    const hasComplexWords = /\b(implement|configure|integrate|troubleshoot|optimize)\b/i.test(query)

    if (wordCount > 20 || hasMultipleQuestions || hasComplexWords) {
      return 'complex'
    } else if (wordCount > 10) {
      return 'moderate'
    } else {
      return 'simple'
    }
  }

  private assessResponseQuality(response: string): number {
    let quality = 0.5 // Base quality

    // Check for completeness indicators
    if (response.length > 50) quality += 0.2
    if (response.includes('step') || response.includes('first') || response.includes('then')) quality += 0.1
    if (response.includes('example') || response.includes('for instance')) quality += 0.1
    if (response.includes('documentation') || response.includes('guide')) quality += 0.1

    // Penalize very short responses
    if (response.length < 20) quality -= 0.2

    return Math.max(0, Math.min(1, quality))
  }

  private extractTags(query: string, response: string): string[] {
    const tags: string[] = []
    const combinedText = `${query} ${response}`.toLowerCase()

    // Technical tags
    const technicalTerms = ['api', 'database', 'integration', 'configuration', 'authentication', 'error', 'bug', 'feature']
    technicalTerms.forEach(term => {
      if (combinedText.includes(term)) {
        tags.push(term)
      }
    })

    // Event-related tags
    const eventTerms = ['event', 'venue', 'guest', 'planning', 'booking', 'schedule', 'invitation']
    eventTerms.forEach(term => {
      if (combinedText.includes(term)) {
        tags.push(term)
      }
    })

    return tags
  }
}