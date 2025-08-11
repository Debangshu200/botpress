import * as sdk from '@botpress/sdk'
import chat from './bp_modules/chat'
import webhook from './bp_modules/webhook'
import openai from './bp_modules/openai'
// import hitl from './bp_modules/hitl' // HITL plugin configuration requires external integration (e.g., Zendesk)

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
  events: {
    hitlAssigned: {
      schema: sdk.z.object({
        conversationId: sdk.z.string(),
        userId: sdk.z.string(),
      }),
    },
    hitlStopped: {
      schema: sdk.z.object({
        conversationId: sdk.z.string(),
      }),
    },
  },
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
// .addPlugin(hitl, {
//   interfaces: {
//     hitl: {
//       id: hitl.id,
//       name: hitl.name,
//       version: hitl.version,
//       entities: hitl.definition.interfaces.hitl.entities,
//       actions: hitl.definition.interfaces.hitl.actions,
//       events: hitl.definition.interfaces.hitl.events,
//       channels: hitl.definition.interfaces.hitl.channels,
//     }
//   },
//   configuration: {
//     onHitlHandoffMessage: 'I\'m connecting you with a human agent who will be able to help you better. Please wait a moment.',
//     onHumanAgentAssignedMessage: 'A human agent has joined the conversation and will assist you.',
//     onHitlStoppedMessage: 'The human agent has ended the session. I\'m back to help you with any other questions.',
//     agentAssignedTimeoutSeconds: 300, // 5 minutes timeout
//     flowOnHitlStopped: true
//   }
// }) // HITL plugin configuration requires external integration (e.g., Zendesk)