# EventTitan Knowledge-Enhanced Chat Guide

This guide explains how to use the knowledge-enhanced chat interface that integrates the knowledge base with GPT-OSS-20B for intelligent event planning assistance.

## 🚀 Quick Start

### Option 1: Command Line Interface (CLI)
```bash
cd bots/eventtitan
npm run chat
```

### Option 2: Web Interface
```bash
cd bots/eventtitan
npm run chat:web
# Then open http://localhost:3001 in your browser
```

### Option 3: Test the System
```bash
cd bots/eventtitan
npm run test:chat
```

## 📋 Prerequisites

1. **GPT-OSS-20B Configuration**: Ensure your `.env` file has the OpenRouter API key:
   ```env
   OPENROUTER_API_KEY=your_api_key_here
   ```

2. **Knowledge Base**: Upload some knowledge documents first:
   ```bash
   npm run upload-knowledge
   ```

3. **Dependencies**: Install required packages:
   ```bash
   npm install
   ```

## 💬 CLI Chat Interface

### Basic Usage
1. Start the chat: `npm run chat`
2. Type your questions naturally
3. Use `/help` for available commands
4. Type `/quit` to exit

### Available Commands
- `/help` - Show all available commands
- `/new` - Start a new chat session
- `/history` - Show current session history
- `/stats` - Display system statistics
- `/config` - Show current configuration
- `/knowledge` - Toggle knowledge base usage
- `/llm` - Toggle LLM enhancement
- `/confidence <0-1>` - Set confidence threshold
- `/temp <0-2>` - Set LLM temperature
- `/tokens <number>` - Set max tokens
- `/clear` - Clear the screen
- `/quit` - Exit the chat

### Example Session
```
💬 You: What factors should I consider when selecting a venue?

🤖 EventTitan:
📚 **Knowledge Base Response:**

Venue selection is crucial for event success. Consider these factors: capacity (ensure it fits your guest count with 10% buffer), location accessibility, parking availability, catering restrictions, audio/visual equipment, decoration policies, and pricing structure.

Venue evaluation checklist:
- Capacity and layout suitability
- Location and accessibility
- Parking and transportation
- Catering kitchen and restrictions
- Audio/visual capabilities
- Decoration and setup policies
- Pricing and payment terms
- Availability for preferred dates

---
💡 *Source: fallback*
```

## 🌐 Web Interface

### Features
- Clean, modern web interface
- Real-time chat experience
- Message history
- Response metadata display
- Mobile-friendly design

### Usage
1. Start the web server: `npm run chat:web`
2. Open http://localhost:3001 in your browser
3. Start chatting immediately
4. View response confidence, quality scores, and token usage

### API Endpoints
- `POST /api/session/start` - Start new session
- `POST /api/message/send` - Send message
- `GET /api/session/history?sessionId=...` - Get history
- `GET /api/stats` - Get statistics

## ⚙️ Configuration Options

### Chat Options
```typescript
interface ChatOptions {
  useKnowledgeBase: boolean      // Enable/disable knowledge base search
  useLLMEnhancement: boolean     // Enable/disable GPT-OSS-20B enhancement
  confidenceThreshold: number    // Minimum confidence for responses (0-1)
  maxTokens: number             // Maximum tokens for LLM responses
  temperature: number           // LLM creativity (0-2)
  enableFallback: boolean       // Enable fallback responses
  contextWindow: number         // Number of previous messages to consider
}
```

### Default Configuration
```typescript
{
  useKnowledgeBase: true,
  useLLMEnhancement: true,
  confidenceThreshold: 0.6,
  maxTokens: 600,
  temperature: 0.7,
  enableFallback: true,
  contextWindow: 5
}
```

## 🧠 How It Works

### Response Generation Pipeline
1. **Knowledge Search**: Searches uploaded documents and fallback knowledge
2. **Confidence Assessment**: Evaluates relevance and confidence scores
3. **Routing Decision**: Determines response strategy based on confidence
4. **Response Generation**: Uses knowledge-only, LLM-enhanced, or LLM-only responses
5. **Quality Assessment**: Evaluates response quality using multiple factors

### Response Sources
- **Knowledge-only**: Direct responses from knowledge base
- **LLM-enhanced**: GPT-OSS-20B responses using knowledge context
- **LLM-only**: Pure GPT-OSS-20B responses without knowledge context
- **Fallback**: Error handling and clarification requests

### Quality Factors
- **Knowledge Relevance** (40%): How well knowledge matches the query
- **LLM Confidence** (30%): Confidence in AI-generated response
- **Response Completeness** (20%): How comprehensive the response is
- **Source Reliability** (10%): Reliability of information sources

## 📊 Monitoring and Statistics

### Available Statistics
- Total and active chat sessions
- Message counts and processing times
- Knowledge base utilization
- GPT-OSS-20B service status
- Response quality metrics

### CLI Commands
```bash
# View chat statistics
/stats

# View system configuration
/config

# View active sessions
/sessions
```

### Web Interface
Visit `/api/stats` endpoint for JSON statistics or view in the web interface.

## 🔧 Troubleshooting

### Common Issues

1. **"GPT-OSS-20B Service: Setup issues detected"**
   - Check your `.env` file has `OPENROUTER_API_KEY`
   - Verify the API key is valid
   - Check network connectivity

2. **"No knowledge base content found"**
   - Upload knowledge documents: `npm run upload-knowledge`
   - Check knowledge stats: `npm run knowledge-stats`

3. **"Rate limit exceeded"**
   - Wait a few minutes before trying again
   - Consider reducing request frequency
   - Check your OpenRouter account limits

4. **Poor response quality**
   - Adjust confidence threshold: `/confidence 0.8`
   - Enable LLM enhancement: `/llm`
   - Add more specific knowledge documents

### Debug Mode
Set environment variable for detailed logging:
```bash
DEBUG=1 npm run chat
```

## 🎯 Best Practices

### For Better Responses
1. **Be Specific**: Ask detailed questions about your event needs
2. **Provide Context**: Mention event type, size, budget, location
3. **Use Keywords**: Include relevant event planning terms
4. **Follow Up**: Ask clarifying questions for more details

### Example Good Questions
- "What's the typical budget breakdown for a 150-person corporate conference?"
- "How do I choose between indoor and outdoor venues for a summer wedding?"
- "What catering options work best for a networking event with dietary restrictions?"

### Configuration Tips
- **High Confidence**: Set threshold to 0.8+ for more reliable responses
- **Creative Responses**: Increase temperature to 0.9+ for more varied answers
- **Detailed Responses**: Increase max tokens to 800+ for comprehensive answers

## 🔗 Integration with EventTitan Bot

The knowledge-enhanced chat can be integrated into the main EventTitan bot:

```typescript
import { intelligentResponsePipeline } from './intelligent-response-pipeline'

// In your bot message handler
const response = await intelligentResponsePipeline.generateResponse({
  query: userMessage,
  userId: userId,
  conversationId: conversationId
})

await bp.sendMessage(response.response)
```

## 📈 Performance Considerations

- **Caching**: Responses are cached to improve performance
- **Rate Limiting**: Built-in rate limiting prevents API abuse
- **Session Management**: Automatic cleanup of old sessions
- **Memory Usage**: Configurable cache sizes and session limits

## 🛠️ Development

### Adding New Features
1. Extend the `ChatOptions` interface
2. Update the pipeline configuration
3. Add CLI commands in `chat-cli.ts`
4. Update web interface if needed

### Testing
```bash
# Run comprehensive tests
npm run test:chat

# Test specific components
npm run test:llm
npm run test:gpt-oss-20b
```

## 📝 License

This knowledge-enhanced chat system is part of the EventTitan bot and follows the same licensing terms.