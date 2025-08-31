# 🚀 Quick Start: Test Your RAG Integration

## ✅ Prerequisites Check

1. **RAG System Running**: Your FastAPI server should be running on `http://localhost:8000`
2. **Dependencies Installed**: Run `npm install` in the eventello bot directory
3. **No TypeScript Errors**: Run `npm run check:type` to verify

## 🧪 Step 1: Test RAG System Endpoints

```bash
# Test if your RAG system is responding
node test-rag.js
```

**Expected Output**: ✅ All tests passed!

## 🤖 Step 2: Start Your Bot

```bash
# Start the eventello bot
npm run dev
```

## 💬 Step 3: Test the Integration

### Test Event Booking (Original Functionality)
```
User: "events"
Bot: [Shows available events]
```

### Test RAG Integration (New Functionality)
```
User: "What is machine learning?"
Bot: "🤖 I'll help you with that question using my knowledge base..."
Bot: [RAG Response from your system]
```

### Test Mixed Conversation
```
User: "What is AI?"
Bot: [RAG Response]

User: "events"
Bot: [Shows events]

User: "How does deep learning work?"
Bot: [RAG Response]
```

## 🔍 What to Look For

### ✅ Success Indicators
- Bot automatically detects questions vs. event requests
- RAG responses appear with proper formatting
- Bot returns to welcome state after each interaction
- No errors in bot console

### ❌ Common Issues
- **"RAG system is not available"** → Check if your FastAPI server is running
- **"Request timed out"** → RAG system might be slow, increase timeout if needed
- **TypeScript errors** → Run `npm run check:type` to identify issues

## 🎯 Test Scenarios

### Scenario 1: Knowledge Questions
- "What is artificial intelligence?"
- "How do neural networks work?"
- "Explain machine learning algorithms"
- "What are the benefits of AI?"

### Scenario 2: Event Booking
- "events"
- "I want to book tickets"
- "Show me available events"

### Scenario 3: Mixed Conversation
- Ask a question → Get RAG response
- Ask about events → Get event list
- Ask another question → Get RAG response again

## 🚨 Troubleshooting

### If RAG System is Down
```
User: "What is AI?"
Bot: "❌ RAG System Error: RAG system is not available. Please try again later."
```

### If Request Times Out
```
User: "What is AI?"
Bot: "❌ RAG System Error: Request to RAG system timed out. Please try again."
```

### If Bot Doesn't Respond
1. Check bot console for errors
2. Verify RAG system is running
3. Check network connectivity
4. Restart the bot

## 🔧 Customization

### Change RAG System URL
Edit `src/index.ts` line with the axios.post call:
```typescript
const response = await axios.post('http://localhost:8000/query', {
  // Change this to your RAG system URL
```

### Modify Question Detection
Edit the logic in `handleWelcome` function to add/remove keywords.

### Adjust Timeout
Change the timeout value in the axios request (currently 10 seconds).

## 📚 Next Steps

1. **Test thoroughly** with various question types
2. **Customize question detection** if needed
3. **Add conversation memory** for follow-up questions
4. **Implement RAG system health monitoring**
5. **Add more sophisticated routing** for different question categories

---

**🎉 Your RAG integration is ready! Test it out and enjoy the enhanced bot capabilities!**
