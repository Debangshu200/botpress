import { Api } from './api'
import { searchKnowledge, isQuestion } from './knowledge-handler'
import * as bp from '.botpress'

const bot = new bp.Bot({
  actions: {},
})

bot.on.message('*', async (args) => {
  console.info('EventTitan bot received message', args.message)

  const api = Api.from(args)
  
  if (args.message.type !== 'text') {
    await api.respond({ 
      type: 'text', 
      text: '📄 I received your file! I can help you with event planning questions and search my knowledge base for relevant information.\n\nType "help" to see what I can do!' 
    })
    return
  }

  const userMessage = args.message.payload.text
  const userMessageLower = userMessage.toLowerCase()
  
  // First, check if this is a question and search knowledge base
  if (isQuestion(userMessage)) {
    console.info('EventTitan: Detected question, searching knowledge base')
    const knowledgeResponse = searchKnowledge(userMessage)
    
    if (knowledgeResponse) {
      console.info('EventTitan: Found relevant knowledge, responding')
      await api.respond({ 
        type: 'text', 
        text: `📚 **Knowledge Base Response:**\n\n${knowledgeResponse}\n\n---\n💡 *This information comes from my event planning knowledge base. Need more specific help? Just ask!*`
      })
      return
    }
    
    console.info('EventTitan: No relevant knowledge found, continuing with normal responses')
  }
  
  // Fall back to normal EventTitan responses
  if (userMessageLower.includes('hello') || userMessageLower.includes('hi')) {
    await api.respond({ 
      type: 'text', 
      text: "👋 Hello! I'm EventTitan, your event management assistant.\n\n🎯 I can help you with:\n• Event planning questions (powered by knowledge base)\n• Venue management\n• Guest coordination\n• Event logistics\n\nType 'help' for more options or ask me any event-related question!"
    })
  } else if (userMessageLower.includes('help')) {
    await api.respond({ 
      type: 'text', 
      text: '🎉 EventTitan Help Menu:\n\n• Ask questions and get answers from my knowledge base\n• Plan and organize events\n• Manage guest lists\n• Coordinate venues and logistics\n• Track event schedules\n\nExample questions:\n"How do I plan a wedding?"\n"What venues are available?"\n"Help me create a guest list"'
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
      text: `🔍 You asked: "${userMessage}"\n\nI'm EventTitan, your event management assistant! Type 'help' to see what I can assist with! 🎉`
    })
  }
})

export default bot