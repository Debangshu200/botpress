import * as gen from './generate-content'
import * as questions from './question-prompt'
import * as bp from '.botpress'

const plugin = new bp.Plugin({
  actions: {},
})

plugin.on.beforeIncomingMessage('*', async ({ data: message, client, ctx, actions }) => {
  try {
    console.info('Knowledge plugin: Processing incoming message', { 
      type: message.type, 
      conversationId: message.conversationId,
      messageId: message.id 
    })
    
    // Skip non-text messages
    if (message.type !== 'text') {
      console.info('Knowledge plugin: Ignoring non-text message, allowing normal bot processing')
      return
    }

    // Skip empty messages
    const text: string = message.payload.text
    if (!text || text.trim().length === 0) {
      console.info('Knowledge plugin: Ignoring empty message, allowing normal bot processing')
      return
    }

    console.info('Knowledge plugin: Extracting questions from text message:', 
      text.substring(0, 100) + (text.length > 100 ? '...' : ''))

    // Extract questions using LLM with error handling
    let llmOutput: string
    try {
      const llmInput = questions.prompt({ text, line: 'L1' })
      llmOutput = await actions.llm.generateContent(llmInput)
      console.debug('Knowledge plugin: LLM response received', { 
        outputLength: llmOutput?.length || 0 
      })
    } catch (error) {
      console.error('Knowledge plugin: LLM generation failed, allowing normal bot processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId: message.conversationId
      })
      return
    }

    // Parse LLM output with error handling
    const { success, json } = gen.parseLLMOutput(llmOutput)
    if (!success) {
      console.warn('Knowledge plugin: Failed to parse LLM output, allowing normal bot processing', {
        outputPreview: llmOutput?.substring(0, 200) + (llmOutput?.length > 200 ? '...' : ''),
        conversationId: message.conversationId
      })
      return
    }

    // Validate question extraction results
    const parsedResult = questions.OutputFormat.safeParse(json)
    if (!parsedResult.success) {
      console.warn('Knowledge plugin: Failed to validate question extraction results, allowing normal bot processing', {
        validationError: parsedResult.error.message,
        conversationId: message.conversationId
      })
      return
    }

    const { data } = parsedResult
    if (!data.hasQuestions || !data.questions?.length) {
      console.info('Knowledge plugin: No questions detected in message, allowing normal bot processing')
      return
    }

    // Generate search query from extracted questions
    const canonicalQuestion = data.questions.map((question) => question.resolved_question).join(' ')
    console.info('Knowledge plugin: Searching knowledge base for:', canonicalQuestion)

    // Search knowledge base with error handling
    let passages: any[]
    try {
      const searchResult = await client.searchFiles({
        query: canonicalQuestion,
      })
      passages = searchResult.passages || []
      console.debug('Knowledge plugin: Knowledge search completed', {
        passageCount: passages.length,
        query: canonicalQuestion
      })
    } catch (error) {
      console.error('Knowledge plugin: Knowledge base search failed, allowing normal bot processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: canonicalQuestion,
        conversationId: message.conversationId
      })
      return
    }

    // Check if relevant knowledge was found
    if (!passages.length) {
      console.info('Knowledge plugin: No relevant knowledge found, allowing normal bot processing')
      return
    }

    console.info('Knowledge plugin: Found relevant knowledge, responding and stopping message processing', {
      passageCount: passages.length
    })

    // Generate response from knowledge passages
    const answer = passages.map((p) => p.content).join('\n')
    
    // Create response message with error handling
    try {
      await client.createMessage({
        conversationId: message.conversationId,
        userId: ctx.botId,
        payload: {
          text: answer,
        },
        tags: {
          'knowledge-plugin': 'true',
          'source': 'knowledge-base'
        },
        type: 'text',
      })

      console.info('Knowledge plugin: Successfully responded with knowledge base content', {
        responseLength: answer.length,
        conversationId: message.conversationId
      })
      
      // Stop further message processing since we handled it
      return { stop: true }

    } catch (error) {
      console.error('Knowledge plugin: Failed to create response message, allowing normal bot processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId: message.conversationId,
        responseLength: answer.length
      })
      return
    }

  } catch (error) {
    // Catch-all error handler to ensure plugin never crashes the bot
    console.error('Knowledge plugin: Unexpected error during processing, allowing normal bot processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      conversationId: message.conversationId,
      messageType: message.type
    })
    return
  }
})

export default plugin
