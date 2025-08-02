# EventTitan Bot

EventTitan is an intelligent event management assistant bot with AI-powered knowledge base capabilities. Upload documents and get instant answers about their content!

## 🚀 Features

### Event Management
- Event planning guidance and tips
- Venue selection assistance
- Guest coordination help
- Event logistics support

### 🧠 AI Knowledge Base
- **Document Upload**: Support for PDF, HTML, and text files
- **Intelligent Q&A**: Ask questions about uploaded documents
- **AI-Powered Answers**: Uses OpenAI to generate comprehensive responses
- **Document Management**: Track and manage uploaded documents per conversation
- **Context-Aware**: Searches through document content to find relevant information

## 🔌 Integrations

- **Chat Integration**: Web chat interface
- **Webhook Integration**: Connect to external services
- **OpenAI Integration**: AI-powered document analysis and Q&A
- **WhatsApp Integration**: (Ready for deployment)

## 📖 Usage

### Basic Commands
- **Greetings**: Say "hello" or "hi" to get started
- **Help**: Type "help" to see all available options
- **Event Planning**: Ask about "event" or "plan" for planning tips
- **Venues**: Ask about "venue" for venue selection guidance
- **Documents**: Type "documents" or "knowledge" to see uploaded files

### 📄 Knowledge Base Usage

1. **Upload Documents**: 
   - Drag and drop PDF, HTML, or text files
   - The bot will automatically process and index the content

2. **Ask Questions**:
   - "What does the document say about [topic]?"
   - "How do I [specific process from uploaded guide]?"
   - "Tell me about [specific information]"
   - "What are the requirements for [something in the document]?"

3. **Get AI Answers**:
   - The bot searches through your uploaded documents
   - Uses OpenAI to generate comprehensive, context-aware answers
   - Cites which documents the information came from

### 💡 Example Interactions

```
User: [Uploads event planning guide PDF]
Bot: 📄 Document "Event Planning Guide.pdf" has been added to your knowledge base!

User: How do I choose the right venue size?
Bot: 📚 Based on your uploaded documents:
According to your Event Planning Guide, venue size should be determined by...
[AI-generated answer based on document content]
```

## 🛠️ Technical Details

### State Management
- **Knowledge Base State**: Stores uploaded documents per conversation
- **Document Processing**: Extracts text content from various file formats
- **Search Functionality**: Intelligent content matching and retrieval

### AI Integration
- **Model**: Uses GPT-3.5-turbo for answer generation
- **Context Window**: Optimized prompts with relevant document excerpts
- **Fallback**: Provides general event planning advice when documents don't contain answers

## 🚀 Deployment

The bot is ready for deployment with multiple integration options:

1. **Botpress Cloud**: Full WhatsApp integration support
2. **Webhook Integration**: Connect to custom WhatsApp services
3. **Chat Integration**: Web-based testing and deployment

## 📋 Supported File Types

- **PDF**: Portable Document Format files
- **HTML**: Web pages and HTML documents  
- **TXT**: Plain text files
- **Future**: More formats can be added as needed

## 🔧 Configuration

The bot includes:
- Conversation-level document storage
- AI-powered content analysis
- Intelligent search and retrieval
- Multi-integration support