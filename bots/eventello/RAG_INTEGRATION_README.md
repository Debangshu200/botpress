# RAG Integration with Eventello Bot

This document explains how to use the RAG (Retrieval-Augmented Generation) system integration with your Eventello bot.

## 🚀 What's Been Added

The Eventello bot now includes:
- **RAG Query Action**: A new action that can query your RAG system
- **Smart Conversation Routing**: Automatically detects when users ask questions vs. want to book events
- **HTTP Integration**: Seamless communication with your RAG system running on localhost:8000

## 🔧 Setup Requirements

### 1. RAG System Running
Make sure your RAG system is running on `http://localhost:8000` with these endpoints:
- `POST /query` - For querying the knowledge base
- `POST /upload-knowledge` - For uploading new knowledge (optional)

### 2. Dependencies Installed
The bot now includes `axios` for HTTP requests:
```bash
npm install
```

## 🎯 How It Works

### Conversation Flow
1. **Welcome State**: Bot detects user intent
2. **Event Booking**: If user types "events" or mentions tickets → Event booking flow
3. **RAG Queries**: If user asks questions (contains ?, what, how, why, etc.) → RAG query flow
4. **Smart Routing**: Bot automatically chooses the right path

### RAG Query Process
1. User asks a question
2. Bot sends question to RAG system via HTTP POST
3. RAG system processes and returns response
4. Bot displays response to user
5. Returns to welcome state for next interaction

## 🧪 Testing the Integration

### Test RAG System Endpoints
```bash
node test-rag.js
```

This will test both endpoints and show you if everything is working.

### Test in Botpress
1. Start your bot: `npm run dev`
2. Ask a question like: "What is machine learning?"
3. The bot should route to RAG and return a response

## 📝 Example Conversations

### Event Booking Flow
```
User: "events"
Bot: [Shows available events]
User: "1"
Bot: [Shows ticket options]
```

### RAG Query Flow
```
User: "What is artificial intelligence?"
Bot: "🤖 I'll help you with that question using my knowledge base..."
Bot: [RAG Response]
Bot: "You can ask another question or type 'events' to book event tickets."
```

## 🔍 Technical Details

### New Action: `queryRAG`
```typescript
queryRAG: {
  title: 'Query RAG System',
  description: 'Query the RAG system for knowledge-based responses',
  input: {
    schema: sdk.z.object({
      query: sdk.z.string()
    })
  },
  output: {
    schema: sdk.z.object({
      response: sdk.z.string(),
      success: sdk.z.boolean(),
      error: sdk.z.string().optional()
    })
  }
}
```

### HTTP Request Details
- **URL**: `http://localhost:8000/query`
- **Method**: POST
- **Headers**: `Content-Type: application/json`
- **Body**: `{ "query": "user question" }`
- **Timeout**: 10 seconds

### Error Handling
The bot handles various error scenarios:
- Connection refused (RAG system down)
- Request timeout
- Invalid response format
- Network errors

## 🚨 Troubleshooting

### Common Issues

1. **"RAG system is not available"**
   - Make sure your RAG system is running on port 8000
   - Check if the endpoint `/query` exists

2. **"Request to RAG system timed out"**
   - RAG system might be slow
   - Increase timeout in the code if needed

3. **"Unexpected response format"**
   - Check your RAG system response format
   - Should return `{ "response": "..." }` or `{ "answer": "..." }`

### Debug Steps
1. Run `node test-rag.js` to test endpoints
2. Check RAG system logs
3. Verify endpoint URLs and response formats
4. Check network connectivity

## 🔄 Customization

### Change RAG System URL
Edit the URL in `src/index.ts`:
```typescript
const response = await axios.post('http://localhost:8000/query', {
  // Change this URL to your RAG system
```

### Modify Question Detection
Edit the logic in `handleWelcome` function:
```typescript
else if (userMessage.includes('?') || userMessage.includes('what') || ...) {
  // Add your custom question detection logic
}
```

### Custom Response Format
Modify the response parsing in `queryRAG` action:
```typescript
if (response.status === 200 && response.data) {
  return {
    response: response.data.response || response.data.answer || 'No response received',
    success: true
  }
}
```

## 📚 Next Steps

1. **Test the integration** with your RAG system
2. **Customize the question detection** if needed
3. **Add more sophisticated routing** for different types of questions
4. **Implement conversation memory** for follow-up questions
5. **Add RAG system health monitoring**

## 🤝 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify your RAG system is working independently
3. Test with the provided test script
4. Check Botpress logs for detailed error information

---

**Happy RAG-ing! 🎉**
