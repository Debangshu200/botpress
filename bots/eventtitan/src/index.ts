import { Api } from './api'
import { AudioHandler } from './audio-handler'
import { EnhancedMessageProcessor } from './enhanced-message-processor'
import { HandoffManager } from './handoff-manager'
import * as bp from '.botpress'

// Initialize the handoff manager
const handoffManager = new HandoffManager({
  enabled: true,
  agentTimeout: 30000,
  queueLimit: 10,
  recordingEnabled: true
})

// Initialize the enhanced message processor with handoff enabled
const messageProcessor = new EnhancedMessageProcessor({
  knowledge: {
    confidenceThreshold: 0.6,
    searchTimeout: 3000,
    maxResults: 5,
    semanticSimilarityWeight: 0.4,
    keywordMatchWeight: 0.3,
    qualityWeight: 0.2,
    coverageWeight: 0.1
  },
  handoff: {
    enabled: true, // Now enabled with HITL integration
    agentTimeout: 30000,
    queueLimit: 10,
    autoHandoffThreshold: 0.3,
    recordConversations: true,
    notifyUser: true
  },
  routing: {
    confidenceThreshold: 0.6,
    clarificationThreshold: 0.4,
    maxSearchResults: 5,
    responseTimeout: 5000,
    fallbackEnabled: true
  },
  processing: {
    maxQueryLength: 500,
    enableLogging: true,
    logLevel: 'info',
    performanceTracking: true,
    cacheEnabled: true,
    cacheTimeout: 300000
  }
})

async function processTextMessage(userMessage: string, api: Api, args: bp.MessageHandlerProps): Promise<void> {
  const userMessageLower = userMessage.toLowerCase()
  
  try {
    // Use enhanced message processor for intelligent routing
    const processingResult = await messageProcessor.processMessage(userMessage)
    
    if (processingResult.shouldRespond && processingResult.response) {
      console.info('EventTitan: Enhanced processor providing response', {
        confidence: processingResult.confidence.score,
        route: processingResult.routingDecision.route,
        processingTime: processingResult.processingTime,
        hasQualityIndicators: !!processingResult.qualityIndicators
      })
      
      // Use formatted response with quality indicators if available, otherwise use basic response
      const responseText = processingResult.formattedResponse || processingResult.response
      
      await api.respond({ 
        type: 'text', 
        text: responseText
      })
      return
    }
    
    if (processingResult.shouldHandoff) {
      console.info('EventTitan: Enhanced processor recommends handoff, initiating human agent connection')
      
      // Prepare handoff context
      const handoffContext = {
        originalQuery: userMessage,
        searchResults: processingResult.searchResults || [],
        conversationHistory: [], // TODO: Implement conversation history tracking
        confidence: processingResult.confidence.score,
        timestamp: new Date()
      }
      
      // Notify user that handoff is being initiated
      await api.respond({
        type: 'text',
        text: "🔄 I'm connecting you with a human expert who can better assist with your question. Please wait a moment..."
      })
      
      try {
        // Initiate handoff using the handoff manager
        const handoffResult = await handoffManager.initiateHandoff(
          args.conversation.id,
          args.user?.id || 'unknown',
          handoffContext,
          args.client
        )
        
        if (handoffResult.success) {
          console.info('EventTitan: Handoff initiated successfully', {
            sessionId: handoffResult.sessionId,
            conversationId: handoffResult.conversationId
          })
          
          await api.respond({
            type: 'text',
            text: "✅ You've been connected to a human expert! They will assist you shortly. Please continue the conversation here."
          })
        } else {
          console.warn('EventTitan: Handoff failed', handoffResult.error)
          
          // Provide appropriate error message based on the failure reason
          let errorMessage = "❌ I'm unable to connect you with a human expert right now. "
          
          if (handoffResult.error?.includes('not available')) {
            errorMessage += handoffResult.estimatedWaitTime 
              ? `All agents are currently busy. Estimated wait time: ${Math.ceil(handoffResult.estimatedWaitTime / 60000)} minutes. `
              : "All agents are currently busy. "
            errorMessage += "Would you like me to try answering your question instead?"
          } else if (handoffResult.error?.includes('disabled') || handoffResult.error?.includes('not available') || handoffResult.error?.includes('not properly configured')) {
            errorMessage += "The human support feature is currently not available. Let me try to help you with my knowledge base instead."
          } else {
            errorMessage += "There was a technical issue. Let me try to help you with my knowledge base instead."
          }
          
          await api.respond({
            type: 'text',
            text: errorMessage
          })
          
          // Try to provide a fallback response if we have search results
          if (processingResult.searchResults && processingResult.searchResults.length > 0) {
            const fallbackResponse = `Here's what I found in my knowledge base:\n\n${processingResult.searchResults[0].content.substring(0, 300)}...`
            await api.respond({
              type: 'text',
              text: fallbackResponse
            })
          } else {
            // If no search results, provide a general helpful response
            await api.respond({
              type: 'text',
              text: "I don't have specific information about that topic in my knowledge base. However, I can help you with event planning, venue management, guest coordination, and event logistics. Try asking me something like:\n\n• \"How do I plan a wedding?\"\n• \"What should I consider when choosing a venue?\"\n• \"Help me create a guest list\"\n\nType 'help' to see more options!"
            })
          }
        }
      } catch (error) {
        console.error('EventTitan: Handoff initiation error', error)
        await api.respond({
          type: 'text',
          text: "❌ There was an error connecting you to a human expert. Let me try to help you with my knowledge base instead."
        })
        
        // Provide fallback response if available
        if (processingResult.searchResults && processingResult.searchResults.length > 0) {
          const fallbackResponse = `Here's what I found:\n\n${processingResult.searchResults[0].content.substring(0, 300)}...`
          await api.respond({
            type: 'text',
            text: fallbackResponse
          })
        }
      }
      return
    }
    
  } catch (error) {
    console.error('EventTitan: Enhanced processing failed, falling back to basic responses', error)
  }
  
  // Fall back to basic EventTitan responses for simple interactions
  if (userMessageLower.includes('hello') || userMessageLower.includes('hi')) {
    await api.respond({ 
      type: 'text', 
      text: "👋 Hello! I'm EventTitan, your intelligent event management assistant.\n\n🎯 I can help you with:\n• Event planning questions (powered by enhanced knowledge search)\n• Venue management\n• Guest coordination\n• Event logistics\n\nType 'help' for more options or ask me any event-related question!"
    })
  } else if (userMessageLower.includes('help')) {
    await api.respond({ 
      type: 'text', 
      text: '🎉 EventTitan Help Menu:\n\n• Ask questions and get intelligent answers from my knowledge base\n• Plan and organize events\n• Manage guest lists\n• Coordinate venues and logistics\n• Track event schedules\n\nExample questions:\n"How do I plan a wedding?"\n"What venues are available?"\n"Help me create a guest list"\n\n💡 I now use advanced confidence scoring to provide better answers!'
    })
  } else if (userMessageLower.includes('event') || userMessageLower.includes('plan')) {
    await api.respond({ 
      type: 'text', 
      text: '📅 Event Planning Tips:\n\n• Start with a clear budget and timeline\n• Choose the right venue for your audience\n• Create detailed guest lists and invitations\n• Plan logistics like catering, entertainment, and setup\n\nWhat type of event are you planning?'
    })
  } else if (userMessageLower.includes('venue')) {
    await api.respond({ 
      type: 'text', 
      text: '🏢 Venue Selection Guide:\n\n• Consider capacity and location\n• Check availability for your dates\n• Review amenities and services\n• Compare pricing and packages\n\nWhat type of venue are you looking for?'
    })
  } else {
    await api.respond({ 
      type: 'text', 
      text: `🔍 You asked: "${userMessage}"\n\nI'm EventTitan, your intelligent event management assistant! Type 'help' to see what I can assist with! 🎉`
    })
  }
}

const bot = new bp.Bot({
  actions: {},
})

bot.on.message('*', async (args) => {
  console.info('EventTitan bot received message', args.message)

  const api = Api.from(args)
  
  // Handle audio messages
  if (args.message.type === 'audio') {
    const audioHandler = new AudioHandler(args.client)
    const audioMessage = {
      type: 'audio' as const,
      payload: {
        audioUrl: args.message.payload.audioUrl
      },
      conversationId: args.conversation.id,
      userId: args.user?.id
    }
    
    const transcribedText = await audioHandler.handleAudioMessage(audioMessage, api)
    
    // If transcription was successful, process the transcribed text
    if (transcribedText) {
      await processTextMessage(transcribedText, api, args)
    }
    return
  }
  
  // Handle non-text, non-audio messages
  if (args.message.type !== 'text') {
    await api.respond({ 
      type: 'text', 
      text: '📄 I received your file! I can help you with event planning questions and search my knowledge base for relevant information.\n\nType "help" to see what I can do!' 
    })
    return
  }

  const userMessage = args.message.payload.text
  await processTextMessage(userMessage, api, args)
})

// Handle HITL events
bot.on.event('hitlAssigned', async (args) => {
  console.info('EventTitan: HITL agent assigned', {
    conversationId: args.event.payload.conversationId,
    userId: args.event.payload.userId
  })
  
  const api = Api.from(args)
  
  // Notify the user that an agent has been assigned
  await api.respond({
    type: 'text',
    text: "👨‍💼 A human expert has joined the conversation and will assist you now. Please feel free to continue asking your questions!"
  })
})

bot.on.event('hitlStopped', async (args) => {
  console.info('EventTitan: HITL session ended', {
    conversationId: args.event.payload.conversationId
  })
  
  const api = Api.from(args)
  
  // Find and end the handoff session
  const activeSessions = handoffManager.getActiveSessions()
  const session = activeSessions.find(s => s.hitlConversationId === args.event.payload.conversationId)
  
  if (session) {
    try {
      await handoffManager.endHandoff(session.id, args.client, 'completed')
      console.info('EventTitan: Handoff session ended successfully', { sessionId: session.id })
    } catch (error) {
      console.error('EventTitan: Error ending handoff session', error)
    }
  }
  
  // Notify the user that the session has ended
  await api.respond({
    type: 'text',
    text: "✅ Your conversation with the human expert has ended. I'm back to assist you with any additional questions!\n\nType 'help' to see what I can do for you."
  })
})

// Cleanup expired sessions periodically
setInterval(() => {
  handoffManager.cleanupExpiredSessions()
}, 60000) // Check every minute

export default bot