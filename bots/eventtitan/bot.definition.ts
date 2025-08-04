import * as sdk from '@botpress/sdk'
import chat from './bp_modules/chat'
import webhook from './bp_modules/webhook'
import openai from './bp_modules/openai'
import whatsapp from './bp_modules/whatsapp'

export default new sdk.BotDefinition({
  integrations: {},
  states: {
    knowledgeBase: {
      type: 'conversation',
      schema: sdk.z.object({
        documents: sdk.z.array(sdk.z.object({
          id: sdk.z.string(),
          name: sdk.z.string(),
          content: sdk.z.string(),
          uploadedAt: sdk.z.string(),
        })).default([]),
      }),
    },
  },
  events: {},
  recurringEvents: {},
})
.addIntegration(chat, { 
  enabled: true, 
  configuration: {}
})
.addIntegration(webhook, {
  enabled: true,
  configuration: {}
})
.addIntegration(openai, {
  enabled: true,
  configuration: {}
})
// .addIntegration(whatsapp, {
//   enabled: true,
//   configuration: {
//     typingIndicatorEmoji: false,
//     downloadMedia: true,
//     downloadedMediaExpiry: 24
//   }
// })