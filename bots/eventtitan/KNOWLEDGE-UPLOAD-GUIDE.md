# 🚀 Advanced Knowledge Base File Upload Guide

## Overview

This guide shows you how to upload different types of files to your EventTitan bot's knowledge base using the **advanced local file upload system**. No Botpress Cloud required!

## 🛠️ System Components

### 1. **KnowledgeFileUploader** (`src/knowledge-file-uploader.ts`)
- Core file processing engine
- Handles multiple file types
- Automatic keyword extraction
- Content chunking for large files
- Duplicate detection
- Local storage (JSON-based)

### 2. **CLI Tool** (`src/upload-knowledge-cli.ts`)
- Command-line interface for easy uploads
- Batch processing capabilities
- Progress tracking and statistics
- Verbose output options

### 3. **Enhanced Knowledge Handler** (`src/enhanced-knowledge-handler.ts`)
- Integrates with existing bot knowledge system
- Backward compatibility with original handler
- Advanced search capabilities
- Confidence scoring

## 📁 Supported File Types

| Extension | Type | Description | Processing Method |
|-----------|------|-------------|-------------------|
| `.txt` | Plain Text | Simple text files | Direct UTF-8 reading |
| `.md` | Markdown | Formatted documentation | Text extraction |
| `.json` | JSON Data | Structured data files | Content parsing |
| `.csv` | CSV Data | Comma-separated values | Text processing |
| `.html` | HTML | Web pages and documents | Tag-aware parsing |
| `.xml` | XML | Structured markup | Content extraction |
| `.rtf` | Rich Text | Formatted text documents | Text extraction |

## 🚀 Quick Start

### 1. **Install Dependencies**
```bash
cd bots/eventtitan
npm install tsx  # For TypeScript execution
```

### 2. **Upload Your First File**
```bash
# Upload a single file
npm run upload-knowledge -- ./knowledge-upload-examples/event-planning-faq.md

# Upload with verbose output
npm run upload-knowledge -- --verbose ./knowledge-upload-examples/venue-selection-guide.txt
```

### 3. **Check Upload Success**
```bash
# View knowledge base statistics
npm run knowledge-stats
```

## 📋 Usage Examples

### **Single File Upload**
```bash
# Basic upload
npm run upload-knowledge -- ./docs/event-guide.md

# With overwrite protection disabled
npm run upload-knowledge -- --overwrite ./docs/updated-guide.md
```

### **Multiple Files Upload**
```bash
# Upload multiple specific files
npm run upload-knowledge -- ./docs/guide1.txt ./docs/guide2.md ./docs/faq.json

# Upload with verbose output
npm run upload-knowledge -- --verbose ./docs/*.txt
```

### **Directory Upload**
```bash
# Upload entire directory
npm run upload-knowledge -- --directory ./knowledge-docs

# Recursive directory upload
npm run upload-knowledge -- --directory ./docs --recursive

# Directory upload with overwrite
npm run upload-knowledge -- --directory ./docs --recursive --overwrite
```

### **Advanced Options**
```bash
# Upload with all options
npm run upload-knowledge -- \
  --directory ./knowledge-base \
  --recursive \
  --overwrite \
  --verbose
```

## 🎯 Practical Examples

### **Example 1: Event Planning Knowledge Base**

1. **Create your knowledge directory:**
```bash
mkdir -p ./my-knowledge-base
```

2. **Add your files:**
```
my-knowledge-base/
├── event-planning-basics.md
├── venue-selection.txt
├── catering-guide.json
├── budget-templates.csv
└── vendor-contacts.html
```

3. **Upload everything:**
```bash
npm run upload-knowledge -- --directory ./my-knowledge-base --verbose
```

### **Example 2: FAQ Upload**

1. **Create FAQ file** (`faq.md`):
```markdown
# Event Planning FAQ

## Q: How much should I budget for catering?
A: Typically 25-35% of your total event budget...

## Q: When should I book my venue?
A: For most events, book 3-6 months in advance...
```

2. **Upload with details:**
```bash
npm run upload-knowledge -- --verbose ./faq.md
```

### **Example 3: Structured Data Upload**

1. **Create JSON data** (`services.json`):
```json
{
  "event_services": {
    "photography": {
      "average_cost": "$1500-3000",
      "booking_timeline": "3-6 months advance",
      "questions_to_ask": ["Do you have backup equipment?", "Can we see a full wedding gallery?"]
    }
  }
}
```

2. **Upload and verify:**
```bash
npm run upload-knowledge -- ./services.json
npm run knowledge-stats
```

## 🔧 Programmatic Usage

### **Basic Integration**
```typescript
import { KnowledgeFileUploader } from './src/knowledge-file-uploader'

const uploader = new KnowledgeFileUploader({
  maxFileSize: 10 * 1024 * 1024, // 10MB
  enableChunking: true,
  extractKeywords: true,
  overwriteExisting: false
})

// Upload a file
const result = await uploader.uploadFile('./my-document.txt')
if (result.success) {
  console.log(`Uploaded: ${result.fileName}`)
  console.log(`Document ID: ${result.documentId}`)
}

// Search knowledge base
const results = uploader.searchKnowledgeBase('venue selection', 5)
console.log(`Found ${results.length} relevant documents`)
```

### **Enhanced Handler Integration**
```typescript
import { EnhancedKnowledgeHandler } from './src/enhanced-knowledge-handler'

const handler = new EnhancedKnowledgeHandler()

// Search with confidence scoring
const searchResult = handler.searchKnowledge('How do I choose a venue?')
console.log(`Content: ${searchResult.content}`)
console.log(`Source: ${searchResult.source}`)
console.log(`Confidence: ${searchResult.confidence}`)

// Add content programmatically
await handler.addContent(
  'Vendor Management Tips',
  'Always get at least 3 quotes from vendors...',
  ['vendors', 'planning', 'tips']
)
```

## 📊 Monitoring and Management

### **View Statistics**
```bash
npm run knowledge-stats
```

**Output:**
```json
{
  "uploadedDocuments": 15,
  "fallbackTopics": 6,
  "totalSize": "2.3 MB",
  "fileTypes": {
    ".md": 8,
    ".txt": 4,
    ".json": 2,
    ".csv": 1
  }
}
```

### **List All Documents**
```typescript
import { EnhancedKnowledgeHandler } from './src/enhanced-knowledge-handler'

const handler = new EnhancedKnowledgeHandler()
const documents = handler.listDocuments()

documents.forEach(doc => {
  console.log(`${doc.name} (${doc.size}) - ${doc.tags.join(', ')}`)
})
```

### **Search and Test**
```typescript
// Test search functionality
const testQueries = [
  'How do I select a venue?',
  'What should I budget for catering?',
  'When should I send invitations?'
]

for (const query of testQueries) {
  const result = handler.searchKnowledge(query)
  console.log(`Query: ${query}`)
  console.log(`Found: ${result.content ? 'Yes' : 'No'}`)
  console.log(`Source: ${result.source}`)
  console.log(`Confidence: ${result.confidence}`)
  console.log('---')
}
```

## 🎨 Content Optimization Tips

### **1. Structure Your Content Well**
```markdown
# Good Structure
## Main Topic
### Subtopic
- Key point 1
- Key point 2

**Q: Common question?**
A: Clear, complete answer with examples.
```

### **2. Use Keywords Strategically**
- Include relevant terms your users might search for
- Use synonyms and variations
- Add context and examples

### **3. Optimize File Names**
```bash
# Good file names
event-planning-checklist.md
venue-selection-guide.txt
catering-cost-breakdown.json

# Avoid
document1.txt
untitled.md
temp-file.txt
```

### **4. Chunk Large Content**
- Break long documents into sections
- Use clear headings and subheadings
- Keep paragraphs focused and concise

## 🔍 Troubleshooting

### **Common Issues**

#### **File Not Found Error**
```bash
❌ my-file.txt: File not found
```
**Solution:** Check file path and ensure file exists

#### **Unsupported File Type**
```bash
❌ document.pdf: Unsupported file extension: .pdf
```
**Solution:** Convert to supported format (.txt, .md, etc.)

#### **File Too Large**
```bash
❌ large-file.txt: File size (15.2 MB) exceeds maximum allowed (10.0 MB)
```
**Solution:** Split file or increase maxFileSize in configuration

#### **Content Quality Warnings**
```bash
✅ short-file.txt
   ⚠️  Warnings: Content is very short (less than 100 characters)
```
**Solution:** Add more detailed content or combine with other files

### **Debug Mode**
```bash
# Enable verbose output for debugging
npm run upload-knowledge -- --verbose ./problematic-file.txt
```

### **Check Knowledge Base**
```typescript
// Verify upload success
const uploader = new KnowledgeFileUploader()
const stats = uploader.getStatistics()
console.log('Total documents:', stats.totalDocuments)

// Search for specific content
const results = uploader.searchKnowledgeBase('your search term')
console.log('Search results:', results.length)
```

## 🚀 Advanced Features

### **Custom Configuration**
```typescript
const uploader = new KnowledgeFileUploader({
  maxFileSize: 20 * 1024 * 1024, // 20MB
  supportedExtensions: ['.txt', '.md', '.json', '.csv', '.html', '.xml'],
  enableChunking: true,
  chunkSize: 1500, // Smaller chunks
  extractKeywords: true,
  generateTags: true,
  overwriteExisting: true, // Allow overwrites
  validateContent: true
})
```

### **Batch Processing**
```typescript
// Process multiple directories
const directories = ['./docs', './guides', './faqs']
const allResults = []

for (const dir of directories) {
  const results = await uploader.uploadDirectory(dir, true)
  allResults.push(...results)
}

console.log(`Processed ${allResults.length} files total`)
```

### **Content Management**
```typescript
const handler = new EnhancedKnowledgeHandler()

// Update existing document
await handler.updateDocument('doc_123', 'Updated content here...')

// Delete document
await handler.deleteDocument('doc_456')

// Add content with custom tags
await handler.addContent(
  'Custom Guide',
  'Your content here...',
  ['custom', 'guide', 'important']
)
```

## 📈 Performance Tips

1. **Optimize File Sizes**: Keep files under 5MB for best performance
2. **Use Descriptive Names**: Help with automatic keyword extraction
3. **Structure Content**: Use headings and clear sections
4. **Regular Cleanup**: Remove outdated documents periodically
5. **Monitor Statistics**: Check upload success rates and file types

## 🔄 Integration with Bot

The uploaded knowledge base automatically integrates with your EventTitan bot through the Enhanced Knowledge Handler. The bot will:

1. **Search uploaded files first** for user queries
2. **Fall back to hardcoded knowledge** if no matches found
3. **Provide confidence scores** for all responses
4. **Handle multiple file types** seamlessly

Your bot is now ready to use your uploaded knowledge base! Test it by asking questions related to your uploaded content.

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify file formats are supported
3. Ensure proper file permissions
4. Test with simple files first
5. Use verbose mode for detailed error information

The system is designed to be robust and handle various file types and sizes while maintaining good performance for your local EventTitan bot.