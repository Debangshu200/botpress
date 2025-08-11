import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConversationRecorder, RecorderConfig, RecordedMessage } from './conversation-recorder'

describe('ConversationRecorder', () => {
  let recorder: ConversationRecorder
  let config: RecorderConfig

  beforeEach(() => {
    config = {
      enabled: true,
      piiFilteringEnabled: true,
      maxRecordingDuration: 30 * 60 * 1000, // 30 minutes
      maxMessageCount: 1000,
      storageRetentionDays: 30,
      privacyCompliant: true,
      learningEnabled: true
    }
    recorder = new ConversationRecorder(config)
  })

  describe('Recording Management', () => {
    it('should start recording a conversation', () => {
      const sessionId = 'test-session-1'
      const conversationId = 'conv-123'
      const userId = 'user-456'

      recorder.startRecording(sessionId, conversationId, undefined, userId)

      const status = recorder.getRecordingStatus(sessionId)
      expect(status).toBeTruthy()
      expect(status?.isRecording).toBe(true)
      expect(status?.messageCount).toBe(0)
    })

    it('should not start recording when disabled', () => {
      const disabledConfig = { ...config, enabled: false }
      const disabledRecorder = new ConversationRecorder(disabledConfig)
      
      const sessionId = 'test-session-1'
      disabledRecorder.startRecording(sessionId, 'conv-123')

      const status = disabledRecorder.getRecordingStatus(sessionId)
      expect(status).toBeNull()
    })

    it('should not start duplicate recordings for same session', () => {
      const sessionId = 'test-session-1'
      
      recorder.startRecording(sessionId, 'conv-123')
      recorder.startRecording(sessionId, 'conv-456') // Should be ignored

      const activeRecordings = recorder.getActiveRecordings()
      expect(activeRecordings).toHaveLength(1)
    })

    it('should stop recording and return conversation record', async () => {
      const sessionId = 'test-session-1'
      recorder.startRecording(sessionId, 'conv-123', 'hitl-789', 'user-456')

      // Record some messages
      recorder.recordMessage(sessionId, {
        sender: 'user',
        content: 'How do I plan an event?',
        messageType: 'text'
      })

      recorder.recordMessage(sessionId, {
        sender: 'agent',
        content: 'To plan an event, you should start by defining your budget and timeline.',
        messageType: 'text'
      })

      const record = await recorder.stopRecording(sessionId)

      expect(record).toBeTruthy()
      expect(record?.sessionId).toBe(sessionId)
      expect(record?.messages).toHaveLength(2)
      expect(record?.endTime).toBeTruthy()
      expect(record?.processed).toBe(false)
    })
  })

  describe('Message Recording', () => {
    beforeEach(() => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')
    })

    it('should record user messages', () => {
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'What venues are available?',
        messageType: 'text'
      })

      const status = recorder.getRecordingStatus('test-session')
      expect(status?.messageCount).toBe(1)
    })

    it('should record agent messages', () => {
      recorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'We have several venues available including ballrooms and conference centers.',
        messageType: 'text'
      })

      const status = recorder.getRecordingStatus('test-session')
      expect(status?.messageCount).toBe(1)
    })

    it('should record bot messages', () => {
      recorder.recordMessage('test-session', {
        sender: 'bot',
        content: 'Connecting you to a human agent...',
        messageType: 'text'
      })

      const status = recorder.getRecordingStatus('test-session')
      expect(status?.messageCount).toBe(1)
    })

    it('should not record messages for non-existent session', () => {
      recorder.recordMessage('non-existent-session', {
        sender: 'user',
        content: 'Test message',
        messageType: 'text'
      })

      const status = recorder.getRecordingStatus('non-existent-session')
      expect(status).toBeNull()
    })

    it('should respect message count limits', () => {
      const limitedConfig = { ...config, maxMessageCount: 2 }
      const limitedRecorder = new ConversationRecorder(limitedConfig)
      
      limitedRecorder.startRecording('test-session', 'conv-123')

      // Record messages up to limit
      limitedRecorder.recordMessage('test-session', {
        sender: 'user',
        content: 'Message 1',
        messageType: 'text'
      })

      limitedRecorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'Response 1',
        messageType: 'text'
      })

      // This should be ignored due to limit
      limitedRecorder.recordMessage('test-session', {
        sender: 'user',
        content: 'Message 2',
        messageType: 'text'
      })

      const status = limitedRecorder.getRecordingStatus('test-session')
      expect(status?.messageCount).toBe(2)
      expect(status?.recordingQuality).toBe('partial')
    })
  })

  describe('PII Filtering', () => {
    beforeEach(() => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')
    })

    it('should filter email addresses', async () => {
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'My email is john.doe@example.com',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      const message = record?.messages[0]
      
      expect(message?.content).toBe('My email is [EMAIL]')
      expect(message?.piiFiltered).toBe(true)
    })

    it('should filter phone numbers', async () => {
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'Call me at (555) 123-4567',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      const message = record?.messages[0]
      
      expect(message?.content).toBe('Call me at [PHONE]')
      expect(message?.piiFiltered).toBe(true)
    })

    it('should filter SSN', async () => {
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'My SSN is 123-45-6789',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      const message = record?.messages[0]
      
      expect(message?.content).toBe('My SSN is [SSN]')
      expect(message?.piiFiltered).toBe(true)
    })

    it('should filter credit card numbers', async () => {
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'My card number is 4532 1234 5678 9012',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      const message = record?.messages[0]
      
      expect(message?.content).toBe('My card number is [CREDIT_CARD]')
      expect(message?.piiFiltered).toBe(true)
    })

    it('should filter addresses', async () => {
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'I live at 123 Main Street',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      const message = record?.messages[0]
      
      expect(message?.content).toBe('I live at [ADDRESS]')
      expect(message?.piiFiltered).toBe(true)
    })

    it('should not filter when PII filtering is disabled', async () => {
      const noPiiConfig = { ...config, piiFilteringEnabled: false }
      const noPiiRecorder = new ConversationRecorder(noPiiConfig)
      
      noPiiRecorder.startRecording('test-session', 'conv-123')
      noPiiRecorder.recordMessage('test-session', {
        sender: 'user',
        content: 'My email is john.doe@example.com',
        messageType: 'text'
      })

      const record = await noPiiRecorder.stopRecording('test-session')
      const message = record?.messages[0]
      
      expect(message?.content).toBe('My email is john.doe@example.com')
      expect(message?.piiFiltered).toBe(false)
    })
  })

  describe('Learning Data Extraction', () => {
    beforeEach(() => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')
    })

    it('should extract learning data from question-answer pairs', async () => {
      // Record a user question
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'How do I book a venue?',
        messageType: 'text'
      })

      // Record agent response
      recorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'To book a venue, you should first check availability, then submit a booking request with your event details.',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      
      expect(record?.learningData).toHaveLength(1)
      
      const learningItem = record?.learningData[0]
      expect(learningItem?.query).toBe('How do I book a venue?')
      expect(learningItem?.response).toBe('To book a venue, you should first check availability, then submit a booking request with your event details.')
      expect(learningItem?.source).toBe('human-agent')
      expect(learningItem?.quality).toBe('pending')
    })

    it('should not extract learning data from non-question messages', async () => {
      // Record a statement (not a question)
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'I need help with my event.',
        messageType: 'text'
      })

      // Record agent response
      recorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'I can help you with that.',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      
      expect(record?.learningData).toHaveLength(0)
    })

    it('should assess query complexity correctly', async () => {
      // Simple query
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'What is a venue?',
        messageType: 'text'
      })

      recorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'A venue is a place where events are held.',
        messageType: 'text'
      })

      // Complex query
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'How do I implement a comprehensive event management system that integrates with multiple booking platforms and handles complex scheduling requirements?',
        messageType: 'text'
      })

      recorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'That requires a multi-step approach involving API integrations and database design.',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      
      expect(record?.learningData).toHaveLength(2)
      expect(record?.learningData[0]?.metadata.queryComplexity).toBe('simple')
      expect(record?.learningData[1]?.metadata.queryComplexity).toBe('complex')
    })

    it('should extract relevant tags from conversations', async () => {
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'How do I configure the API for event booking?',
        messageType: 'text'
      })

      recorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'You need to set up the API integration with proper authentication.',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      
      const learningItem = record?.learningData[0]
      expect(learningItem?.metadata.tags).toContain('api')
      expect(learningItem?.metadata.tags).toContain('event')
    })

    it('should not extract learning data when learning is disabled', async () => {
      const noLearningConfig = { ...config, learningEnabled: false }
      const noLearningRecorder = new ConversationRecorder(noLearningConfig)
      
      noLearningRecorder.startRecording('test-session', 'conv-123')
      
      noLearningRecorder.recordMessage('test-session', {
        sender: 'user',
        content: 'How do I plan an event?',
        messageType: 'text'
      })

      noLearningRecorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'Start with a budget and timeline.',
        messageType: 'text'
      })

      const record = await noLearningRecorder.stopRecording('test-session')
      
      expect(record?.learningData).toHaveLength(0)
    })
  })

  describe('Recording Quality Assessment', () => {
    it('should assess complete recording quality', async () => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')

      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'Hello',
        messageType: 'text'
      })

      recorder.recordMessage('test-session', {
        sender: 'agent',
        content: 'Hi, how can I help?',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      
      expect(record?.metadata.recordingQuality).toBe('complete')
    })

    it('should assess partial recording quality when only user messages', async () => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')

      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'Hello',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      
      expect(record?.metadata.recordingQuality).toBe('partial')
    })

    it('should assess failed recording quality when no messages', async () => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')

      const record = await recorder.stopRecording('test-session')
      
      expect(record?.metadata.recordingQuality).toBe('failed')
    })
  })

  describe('Privacy and Compliance', () => {
    it('should maintain privacy compliance metadata', async () => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')

      const record = await recorder.stopRecording('test-session')
      
      expect(record?.metadata.privacyCompliant).toBe(true)
      expect(record?.metadata.piiFilteringEnabled).toBe(true)
    })

    it('should track PII filtering statistics', async () => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')

      // Message with PII
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'My email is test@example.com',
        messageType: 'text'
      })

      // Message without PII
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: 'How do I plan an event?',
        messageType: 'text'
      })

      const record = await recorder.stopRecording('test-session')
      
      expect(record?.metadata.totalMessages).toBe(2)
      expect(record?.metadata.filteredMessages).toBe(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle recording errors gracefully', async () => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')

      // Simulate error in learning data extraction by providing malformed data
      const originalExtractLearningData = recorder['extractLearningData']
      recorder['extractLearningData'] = vi.fn().mockRejectedValue(new Error('Learning extraction failed'))

      const record = await recorder.stopRecording('test-session')
      
      expect(record).toBeTruthy()
      expect(record?.learningData).toHaveLength(0)
      
      // Restore original method
      recorder['extractLearningData'] = originalExtractLearningData
    })

    it('should handle invalid message data', () => {
      recorder.startRecording('test-session', 'conv-123', 'hitl-789', 'user-456')

      // Record message with minimal data
      recorder.recordMessage('test-session', {
        sender: 'user',
        content: '',
        messageType: 'text'
      })

      const status = recorder.getRecordingStatus('test-session')
      expect(status?.messageCount).toBe(1)
    })
  })
})