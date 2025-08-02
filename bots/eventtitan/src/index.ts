import { Api } from './api'
import * as bp from '.botpress'

const bot = new bp.Bot({
  actions: {},
})

bot.on.message('*', async (args) => {
  console.info('received message', args.message)

  const api = Api.from(args)
  
  if (args.message.type !== 'text') {
    await api.respond({ 
      type: 'text', 
      text: '📄 I received your file! Knowledge base functionality will be added soon.\n\nFor now, I can help you with event planning questions. Type "help" to see what I can do!' 
    })
    return
  }

  const userMessage = args.message.payload.text.toLowerCase()
  
  if (userMessage.includes('hello') || userMessage.includes('hi')) {
    await api.respond({ 
      type: 'text', 
      text: "👋 Hello! I'm EventTitan, your event management assistant.\n\n🎯 I can help you with:\n• Event planning\n• Venue management\n• Guest coordination\n• Event logistics\n\nType 'help' for more options!"
    })
  } else if (userMessage.includes('help')) {
    await api.respond({ 
      type: 'text', 
      text: '🎉 EventTitan Help Menu:\n\n• Plan and organize events\n• Manage guest lists\n• Coordinate venues and logistics\n• Track event schedules\n\nExample questions:\n"How do I plan a wedding?"\n"What venues are available?"\n"Help me create a guest list"'
    })
  } else if (userMessage.includes('event') || userMessage.includes('plan')) {
    await api.respond({ 
      type: 'text', 
      text: '📅 Event Planning Tips:\n\n• Start with a clear budget and timeline\n• Choose the right venue for your audience\n• Create detailed guest lists and invitations\n• Plan logistics like catering, entertainment, and setup\n\nWhat type of event are you planning?'
    })
  } else if (userMessage.includes('venue')) {
    await api.respond({ 
      type: 'text', 
      text: '🏢 Venue Selection Guide:\n\n• Consider capacity and location\n• Check availability for your dates\n• Review amenities and services\n• Compare pricing and packages\n\nWhat type of venue are you looking for?'
    })
  } else {
    await api.respond({ 
      type: 'text', 
      text: `🔍 You asked: "${args.message.payload.text}"\n\nI'm EventTitan, your event management assistant! Type 'help' to see what I can assist with! 🎉`
    })
  }
})

export default bot