import * as bp from '.botpress'
import { Api } from './api'

export interface AudioHandlerOptions {
  fileUrl: string;
  conversationId: string;
  userId: string;
}

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
  errorType?: 'service_unavailable' | 'empty_transcription' | 'timeout' | 'file_processing' | 'unknown_error';
  cost?: number;
}

export interface AudioMessage {
  type: 'audio';
  payload: {
    audioUrl: string;
  };
  conversationId: string;
  userId?: string;
}

export class AudioHandler {
  constructor(private client: bp.Client) {}

  private getErrorMessage(errorType: string): string {
    switch (errorType) {
      case 'service_unavailable':
        return "🎤 Sorry, I'm having trouble processing audio right now. Please try typing your message instead.";
      case 'empty_transcription':
        return "🎤 I couldn't hear anything in your message. Could you try speaking more clearly or typing instead?";
      case 'timeout':
        return "🎤 Your audio is taking longer to process than expected. Please try a shorter message or type instead.";
      case 'file_processing':
        return "🎤 I couldn't process your audio file. Please try recording again or type your message.";
      default:
        return "🎤 I had trouble processing your voice message. Please try again or type your message instead.";
    }
  }

  async handleAudioMessage(message: AudioMessage, api: Api): Promise<string | null> {
    try {
      console.info('AudioHandler: Processing audio message', {
        conversationId: message.conversationId,
        userId: message.userId,
        audioUrl: message.payload.audioUrl
      })

      // Send processing acknowledgment
      await api.respond({
        type: 'text',
        text: '🎤 I received your voice message! Processing your audio now...'
      })

      // Transcribe the audio
      const transcriptionResult = await this.transcribeAudio({
        fileUrl: message.payload.audioUrl,
        conversationId: message.conversationId,
        userId: message.userId || 'unknown'
      })

      if (!transcriptionResult.success) {
        console.warn('AudioHandler: Transcription failed, sending error message to user', {
          error: transcriptionResult.error,
          errorType: transcriptionResult.errorType,
          conversationId: message.conversationId
        })
        
        // Send user-friendly error message
        const errorMessage = this.getErrorMessage(transcriptionResult.errorType || 'unknown_error')
        await api.respond({
          type: 'text',
          text: errorMessage
        })
        
        return null
      }

      console.info('AudioHandler: Audio message processed successfully', {
        transcribedText: transcriptionResult.text,
        cost: transcriptionResult.cost,
        conversationId: message.conversationId
      })

      return transcriptionResult.text || null

    } catch (error) {
      console.error('AudioHandler: Failed to handle audio message', {
        error: error instanceof Error ? error.message : String(error),
        conversationId: message.conversationId,
        audioUrl: message.payload.audioUrl
      })
      
      // Send error message to user for unexpected errors
      try {
        await api.respond({
          type: 'text',
          text: this.getErrorMessage('unknown_error')
        })
      } catch (responseError) {
        console.error('AudioHandler: Failed to send error response to user', {
          responseError: responseError instanceof Error ? responseError.message : String(responseError),
          conversationId: message.conversationId
        })
      }
      
      return null
    }
  }

  async transcribeAudio(options: AudioHandlerOptions): Promise<TranscriptionResult> {
    try {
      console.info('AudioHandler: Starting transcription for audio file', {
        fileUrl: options.fileUrl,
        conversationId: options.conversationId,
        userId: options.userId
      })

      const { output } = await this.client.callAction({
        type: 'openai:transcribeAudio',
        input: {
          fileUrl: options.fileUrl,
          temperature: 0.2 // Lower temperature for more focused transcription
        }
      })

      // Extract the full text from segments
      const transcribedText = output.segments
        .map(segment => segment.text)
        .join(' ')
        .trim()

      if (!transcribedText) {
        console.warn('AudioHandler: Transcription returned empty text', {
          segments: output.segments,
          conversationId: options.conversationId
        })
        
        return {
          success: false,
          error: 'empty_transcription',
          errorType: 'empty_transcription',
          cost: output.botpress.cost
        }
      }

      console.info('AudioHandler: Transcription successful', {
        text: transcribedText,
        language: output.language,
        duration: output.duration,
        cost: output.botpress.cost,
        conversationId: options.conversationId
      })

      return {
        success: true,
        text: transcribedText,
        cost: output.botpress.cost
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      console.error('AudioHandler: Transcription failed', {
        error: errorMessage,
        conversationId: options.conversationId,
        fileUrl: options.fileUrl
      })

      // Categorize the error based on the error message
      let errorType: 'service_unavailable' | 'timeout' | 'file_processing' | 'unknown_error' = 'unknown_error'
      
      if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('timed out')) {
        errorType = 'timeout'
      } else if (errorMessage.toLowerCase().includes('service unavailable') || 
                 errorMessage.toLowerCase().includes('502') || 
                 errorMessage.toLowerCase().includes('503') ||
                 errorMessage.toLowerCase().includes('connection')) {
        errorType = 'service_unavailable'
      } else if (errorMessage.toLowerCase().includes('file') || 
                 errorMessage.toLowerCase().includes('format') ||
                 errorMessage.toLowerCase().includes('audio') ||
                 errorMessage.toLowerCase().includes('invalid')) {
        errorType = 'file_processing'
      }

      return {
        success: false,
        error: errorMessage,
        errorType: errorType
      }
    }
  }
}