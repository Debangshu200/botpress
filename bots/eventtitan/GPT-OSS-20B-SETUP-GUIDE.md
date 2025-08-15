# GPT-OSS-20B Setup Guide

This guide will help you configure the GPT-OSS-20B model from AtlasCloud via OpenRouter for your EventTitan bot.

## Overview

GPT-OSS-20B is a 20-billion parameter language model provided by AtlasCloud through OpenRouter's free tier. It offers good performance for complex reasoning tasks while being available at no cost.

## Prerequisites

1. **OpenRouter Account**: Sign up at [https://openrouter.ai](https://openrouter.ai)
2. **API Key**: Get your free API key from [https://openrouter.ai/keys](https://openrouter.ai/keys)
3. **Node.js Environment**: Ensure your bot environment is set up

## Step 1: Get Your OpenRouter API Key

1. Visit [https://openrouter.ai](https://openrouter.ai)
2. Sign up for a free account
3. Go to [https://openrouter.ai/keys](https://openrouter.ai/keys)
4. Create a new API key
5. Copy the key (it starts with `sk-or-v1-`)

## Step 2: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.gpt-oss-20b.example .env
   ```

2. Edit the `.env` file and add your API key:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-actual-api-key-here
   ```

3. Optional: Customize other settings:
   ```env
   GPT_OSS_20B_MODEL=gpt-oss-20b:free
   GPT_OSS_20B_MAX_TOKENS=800
   GPT_OSS_20B_TEMPERATURE=0.7
   GPT_OSS_20B_RATE_LIMIT=5
   ```

## Step 3: Test the Configuration

Run the test script to verify everything is working:

```bash
# From the eventtitan bot directory
npm run test:gpt-oss-20b
```

Or run directly with Node.js:
```bash
npx tsx src/test-gpt-oss-20b.ts
```

## Step 4: Integration Options

### Option A: Use as Primary LLM Service

Replace your existing LLM service with GPT-OSS-20B:

```typescript
import { gptOss20BService } from './gpt-oss-20b-service'

// In your bot logic
const response = await gptOss20BService.generateResponse({
  prompt: userMessage,
  context: knowledgeContext,
  useOptimization: true
})
```

### Option B: Use as Fallback or Alternative

Keep your existing service and use GPT-OSS-20B for specific scenarios:

```typescript
import { gptOss20BService } from './gpt-oss-20b-service'
import { openRouterService } from './openrouter-llm-service'

// Use GPT-OSS-20B for complex questions
if (isComplexQuery(userMessage)) {
  response = await gptOss20BService.generateResponse({
    prompt: userMessage,
    context: knowledgeContext
  })
} else {
  response = await openRouterService.generateResponse({
    prompt: userMessage,
    context: knowledgeContext
  })
}
```

### Option C: Smart Model Selection

Automatically choose the best model based on the query:

```typescript
import { gptOss20BService } from './gpt-oss-20b-service'

async function generateSmartResponse(prompt: string, context?: string) {
  // Use GPT-OSS-20B for detailed, complex queries
  const useGPTOss20B = 
    prompt.length > 100 || 
    prompt.includes('detailed') || 
    prompt.includes('explain') ||
    prompt.includes('complex')

  if (useGPTOss20B) {
    return await gptOss20BService.generateResponse({
      prompt,
      context,
      useOptimization: true
    })
  } else {
    // Use faster model for simple queries
    return await openRouterService.generateResponse({ prompt, context })
  }
}
```

## Model Capabilities

### Strengths
- Large parameter count (20B) for better understanding
- Good at following instructions
- Decent reasoning capabilities
- Free tier availability
- Reasonable context window

### Best Use Cases
- Complex question answering
- Detailed explanations
- Event planning advice
- Multi-step reasoning tasks
- Content generation with context

### Limitations
- May have slower response times due to model size
- Free tier rate limits apply
- May not be as fast as smaller models
- Context window limitations compared to newer models

## Configuration Options

### Model Parameters

```typescript
// In your .env file or configuration
GPT_OSS_20B_MAX_TOKENS=1024      // Response length (50-4096)
GPT_OSS_20B_TEMPERATURE=0.7      // Creativity (0.0-2.0)
GPT_OSS_20B_RATE_LIMIT=6         // Requests per minute
GPT_OSS_20B_TIMEOUT=45000        // Timeout in milliseconds
```

### Optimization Features

The service includes several optimization features:

1. **Prompt Optimization**: Automatically improves prompts for better results
2. **Caching**: Reduces API calls by caching responses
3. **Rate Limiting**: Prevents exceeding free tier limits
4. **Fallback Models**: Automatically switches to backup models if needed
5. **Error Handling**: Robust error handling with retries

## Troubleshooting

### Common Issues

1. **"API key is required" error**
   - Ensure `OPENROUTER_API_KEY` is set in your environment
   - Check that the key starts with `sk-or-v1-`

2. **"Rate limit exceeded" error**
   - Reduce `GPT_OSS_20B_RATE_LIMIT` value
   - Enable caching to reduce API calls
   - Wait before making more requests

3. **"Model not available" error**
   - Try alternative model names:
     - `gpt-oss-20b:free`
     - `atlascloud/gpt-oss-20b:free`
     - `gpt-oss-20b`
   - Check OpenRouter documentation for current model availability

4. **Slow responses**
   - Reduce `GPT_OSS_20B_MAX_TOKENS`
   - Lower `GPT_OSS_20B_TEMPERATURE`
   - Enable caching for repeated queries

5. **"Insufficient credits" error**
   - This shouldn't happen with free models
   - Check your OpenRouter account status
   - Try alternative free models

### Debug Mode

Enable detailed logging by setting:
```env
DEBUG=gpt-oss-20b:*
```

### Test Commands

```bash
# Test basic configuration
npx tsx src/test-gpt-oss-20b.ts

# Test specific functionality
node -e "
const { gptOss20BService } = require('./src/gpt-oss-20b-service');
gptOss20BService.testConnection().then(console.log);
"
```

## Performance Tips

1. **Use Caching**: Enable caching for repeated queries
2. **Optimize Prompts**: Use the built-in prompt optimization
3. **Batch Requests**: Group similar requests when possible
4. **Monitor Rate Limits**: Stay within free tier limits
5. **Use Fallbacks**: Configure fallback models for reliability

## Integration Examples

### Basic Integration

```typescript
import { gptOss20BService } from './gpt-oss-20b-service'

export async function handleUserMessage(message: string, context?: string) {
  try {
    const response = await gptOss20BService.generateResponse({
      prompt: message,
      context: context,
      useOptimization: true
    })

    if (response.success) {
      return response.content
    } else {
      console.error('GPT-OSS-20B error:', response.error)
      return 'I apologize, but I encountered an error processing your request.'
    }
  } catch (error) {
    console.error('Service error:', error)
    return 'I apologize, but I am currently unavailable.'
  }
}
```

### Advanced Integration with Confidence Scoring

```typescript
import { gptOss20BService } from './gpt-oss-20b-service'

export async function handleUserMessageWithConfidence(message: string, context?: string) {
  const response = await gptOss20BService.generateResponse({
    prompt: message,
    context: context,
    useOptimization: true
  })

  if (response.success) {
    // Calculate confidence based on response characteristics
    const confidence = calculateConfidence(response)
    
    if (confidence > 0.8) {
      return {
        content: response.content,
        confidence: 'high',
        source: 'gpt-oss-20b'
      }
    } else if (confidence > 0.5) {
      return {
        content: response.content + '\n\n*Please verify this information.*',
        confidence: 'medium',
        source: 'gpt-oss-20b'
      }
    } else {
      // Low confidence - might want to use fallback or ask for clarification
      return {
        content: 'I need more information to provide a confident answer. Could you please be more specific?',
        confidence: 'low',
        source: 'system'
      }
    }
  } else {
    throw new Error(response.error)
  }
}

function calculateConfidence(response: any): number {
  // Simple confidence calculation based on response characteristics
  let confidence = 0.5 // Base confidence
  
  if (response.tokensUsed > 50) confidence += 0.1 // Longer responses might be more detailed
  if (response.processingTime < 10000) confidence += 0.1 // Faster responses might be more confident
  if (response.cached) confidence += 0.2 // Cached responses are consistent
  
  return Math.min(confidence, 1.0)
}
```

## Support

If you encounter issues:

1. Check the [OpenRouter documentation](https://openrouter.ai/docs)
2. Verify your API key and account status
3. Run the test script to diagnose issues
4. Check the console logs for detailed error messages

## Next Steps

After successful setup:

1. Integrate GPT-OSS-20B into your bot's message handling
2. Monitor performance and adjust rate limits as needed
3. Experiment with different temperature and token settings
4. Consider implementing confidence scoring for responses
5. Set up monitoring and alerting for API failures

Happy coding! 🚀