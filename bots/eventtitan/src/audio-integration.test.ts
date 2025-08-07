import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioHandler } from './audio-handler'
import { Api } from './api'

// Mock the botpress client
const mockClient = {
  callAction: vi.fn()
}

// Mock the Api class
const mockApi = {
  respond: vi.fn()
}

describe('Audio Integration', () => {
  let audioHandler: AudioHandler

  beforeEach(() => {
    vi.clearAllMocks()
    audioHandler = new AudioHandler(mockClient as any)
  })

  it('should handle successful audio transcription', async () => {
    // Mock successful transcription response
    mockClient.callAction.mockResolvedValue({
      output: {
        segments: [
          { text: 'Hello, ' },
          { text: 'how do I plan a wedding?' }
        ],
        language: 'en',
        duration: 3.5,
        botpress: {
          cost: 0.006
        }
      }
    })

    const audioMessage = {
      type: 'audio' as const,
      payload: {
        audioUrl: 'https://example.com/audio.mp3'
      },
      conversationId: 'conv-123',
      userId: 'user-456'
    }

    const result = await audioHandler.handleAudioMessage(audioMessage, mockApi as any)

    expect(result).toBe('Hello,  how do I plan a wedding?')
    expect(mockApi.respond).toHaveBeenCalledWith({
      type: 'text',
      text: '🎤 I received your voice message! Processing your audio now...'
    })
    expect(mockClient.callAction).toHaveBeenCalledWith({
      type: 'openai:transcribeAudio',
      input: {
        fileUrl: 'https://example.com/audio.mp3',
        temperature: 0.2
      }
    })
  })

  it('should handle transcription errors gracefully', async () => {
    // Mock transcription error
    mockClient.callAction.mockRejectedValue(new Error('Service unavailable'))

    const audioMessage = {
      type: 'audio' as const,
      payload: {
        audioUrl: 'https://example.com/audio.mp3'
      },
      conversationId: 'conv-123',
      userId: 'user-456'
    }

    const result = await audioHandler.handleAudioMessage(audioMessage, mockApi as any)

    expect(result).toBeNull()
    expect(mockApi.respond).toHaveBeenCalledWith({
      type: 'text',
      text: '🎤 I received your voice message! Processing your audio now...'
    })
    expect(mockApi.respond).toHaveBeenCalledWith({
      type: 'text',
      text: "🎤 Sorry, I'm having trouble processing audio right now. Please try typing your message instead."
    })
  })

  it('should handle empty transcription results', async () => {
    // Mock empty transcription response
    mockClient.callAction.mockResolvedValue({
      output: {
        segments: [],
        language: 'en',
        duration: 1.0,
        botpress: {
          cost: 0.002
        }
      }
    })

    const audioMessage = {
      type: 'audio' as const,
      payload: {
        audioUrl: 'https://example.com/audio.mp3'
      },
      conversationId: 'conv-123',
      userId: 'user-456'
    }

    const result = await audioHandler.handleAudioMessage(audioMessage, mockApi as any)

    expect(result).toBeNull()
    expect(mockApi.respond).toHaveBeenCalledWith({
      type: 'text',
      text: "🎤 I couldn't hear anything in your message. Could you try speaking more clearly or typing instead?"
    })
  })
})