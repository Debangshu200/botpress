# Design Document

## Overview

This design outlines the integration of the existing knowledge plugin with the EventTitan bot to enable automatic knowledge base responses. The solution leverages the existing knowledge plugin architecture while adapting it for seamless integration with the bot's current message handling flow.

The knowledge plugin will act as a message interceptor that processes incoming text messages, extracts questions using LLM-powered analysis, searches the knowledge base for relevant content, and responds with appropriate answers when found.

## Architecture

### High-Level Flow
1. User sends a text message to the bot
2. Knowledge plugin intercepts the message via `beforeIncomingMessage` hook
3. Plugin extracts questions from the message using LLM
4. Plugin searches knowledge base using extracted questions
5. If relevant content is found, plugin responds and stops further processing
6. If no content is found, normal bot flow continues

### Component Integration
- **Existing Knowledge Plugin**: Provides core question extraction and knowledge search functionality
- **EventTitan Bot**: Current bot implementation with event-focused responses
- **Botpress Client**: Handles knowledge base search and message creation
- **LLM Interface**: Powers question extraction and content parsing

## Components and Interfaces

### Knowledge Plugin Integration
The knowledge plugin will be added to the EventTitan bot configuration as a dependency. The plugin operates independently of the bot's main message handlers through the event hook system.

**Key Components:**
- `question-prompt.ts`: Handles LLM-powered question extraction with context awareness
- `generate-content.ts`: Manages LLM response parsing and JSON handling
- `index.ts`: Main plugin logic with message interception and knowledge search

### Bot Configuration Updates
The EventTitan bot will need to:
1. Import and configure the knowledge plugin
2. Maintain existing message handling for non-knowledge queries
3. Allow knowledge plugin to take precedence when relevant content is found

### Message Flow Control
The plugin uses a `beforeIncomingMessage` hook with a return value of `{ stop: true }` to prevent further message processing when knowledge base content is found and responded to.

## Data Models

### Question Extraction Model
```typescript
type ExtractedQuestion = {
  line: string;           // Line reference (e.g., "L1")
  raw_question: string;   // Original question text
  resolved_question: string; // Question with context filled in
  search_query: string;   // Optimized search query
}

type OutputFormat = {
  hasQuestions: boolean;
  questions?: ExtractedQuestion[];
}
```

### Knowledge Search Results
```typescript
type SearchResult = {
  passages: Array<{
    content: string;
    // Additional metadata from Botpress client
  }>;
}
```

### Plugin Configuration
The knowledge plugin uses minimal configuration:
```typescript
{
  name: 'knowledge',
  version: '0.0.1',
  configuration: { schema: z.object({}) },
  interfaces: { llm }
}
```

## Error Handling

### LLM Processing Failures
- Plugin gracefully handles LLM generation failures
- Logs debug information for troubleshooting
- Continues normal bot flow if question extraction fails
- Uses JSON repair utilities for malformed LLM responses

### Knowledge Base Search Failures
- Handles empty search results without errors
- Logs search queries for debugging
- Falls back to normal bot processing when no passages found
- Manages client API errors gracefully

### Message Processing Errors
- Validates message type and content before processing
- Skips non-text messages without interference
- Handles missing or empty message payloads
- Ensures bot stability during plugin failures

## Testing Strategy

### Unit Testing
- Test question extraction with various message types
- Validate LLM response parsing and JSON handling
- Test knowledge base search result processing
- Verify error handling for edge cases

### Integration Testing
- Test plugin integration with EventTitan bot
- Verify message flow control (stop/continue logic)
- Test knowledge responses vs. normal bot responses
- Validate plugin doesn't interfere with existing bot functionality

### End-to-End Testing
- Test complete user journey from question to knowledge response
- Verify fallback to normal bot behavior when no knowledge found
- Test with various question types and contexts
- Validate performance and response times

### Test Scenarios
1. **Knowledge Available**: User asks question with relevant knowledge base content
2. **No Knowledge**: User asks question with no relevant content
3. **Non-Question**: User sends statement or greeting
4. **Non-Text**: User sends file or other media
5. **LLM Failure**: Question extraction fails
6. **Search Failure**: Knowledge base search fails
7. **Mixed Content**: Message contains both questions and statements