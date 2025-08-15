/**
 * Document-Based Knowledge Handler
 * This provides responses ONLY from uploaded documents in knowledge-upload-examples
 */

import * as fs from 'fs'
import * as path from 'path'

// Load actual knowledge documents
const KNOWLEDGE_BASE_PATH = path.join(__dirname, '..', 'knowledge-upload-examples')
const FALLBACK_MESSAGE = "Sorry I don't have any answer, let me connect you to our customer care associate"

interface KnowledgeDocument {
  filename: string
  content: string
  type: 'faq' | 'guide' | 'options'
}

let knowledgeDocuments: KnowledgeDocument[] = []

// Load documents on initialization
function loadKnowledgeDocuments(): void {
  try {
    // Load FAQ document
    const faqPath = path.join(KNOWLEDGE_BASE_PATH, 'event-planning-faq.md')
    if (fs.existsSync(faqPath)) {
      knowledgeDocuments.push({
        filename: 'event-planning-faq.md',
        content: fs.readFileSync(faqPath, 'utf-8'),
        type: 'faq'
      })
    }

    // Load venue guide
    const venueGuidePath = path.join(KNOWLEDGE_BASE_PATH, 'venue-selection-guide.txt')
    if (fs.existsSync(venueGuidePath)) {
      knowledgeDocuments.push({
        filename: 'venue-selection-guide.txt',
        content: fs.readFileSync(venueGuidePath, 'utf-8'),
        type: 'guide'
      })
    }

    // Load catering options
    const cateringPath = path.join(KNOWLEDGE_BASE_PATH, 'catering-options.json')
    if (fs.existsSync(cateringPath)) {
      const cateringData = JSON.parse(fs.readFileSync(cateringPath, 'utf-8'))
      knowledgeDocuments.push({
        filename: 'catering-options.json',
        content: JSON.stringify(cateringData, null, 2),
        type: 'options'
      })
    }

    console.log(`Loaded ${knowledgeDocuments.length} knowledge documents`)
  } catch (error) {
    console.error('Error loading knowledge documents:', error)
  }
}

// Initialize documents
loadKnowledgeDocuments()

export function searchKnowledge(query: string): string | null {
  if (knowledgeDocuments.length === 0) {
    console.warn('No knowledge documents loaded')
    return null
  }

  const queryLower = query.toLowerCase()
  let bestMatch: { document: KnowledgeDocument, relevantContent: string, score: number } | null = null
  
  // Search through each document
  for (const document of knowledgeDocuments) {
    const relevantContent = findRelevantContent(document, queryLower)
    if (relevantContent) {
      const score = calculateRelevanceScore(queryLower, relevantContent)
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { document, relevantContent, score }
      }
    }
  }
  
  if (!bestMatch) {
    return null // This will trigger the fallback message
  }
  
  // Return the relevant content from the document
  return formatDocumentResponse(bestMatch.relevantContent, bestMatch.document.type)
}

function findRelevantContent(document: KnowledgeDocument, query: string): string | null {
  const content = document.content.toLowerCase()
  
  // Extract keywords from query
  const keywords = extractQueryKeywords(query)
  if (keywords.length === 0) return null
  
  // For FAQ documents, look for Q&A pairs
  if (document.type === 'faq') {
    return findRelevantFAQ(document.content, keywords, query)
  }
  
  // For guide documents, look for relevant sections
  if (document.type === 'guide') {
    return findRelevantGuideSection(document.content, keywords, query)
  }
  
  // For JSON options, search through the structured data
  if (document.type === 'options') {
    return findRelevantOptions(document.content, keywords, query)
  }
  
  return null
}

function findRelevantFAQ(content: string, keywords: string[], query: string): string | null {
  const lines = content.split('\n')
  let currentQuestion = ''
  let currentAnswer = ''
  let inAnswer = false
  let bestMatch = ''
  let bestScore = 0
  
  for (const line of lines) {
    if (line.startsWith('### Q:')) {
      // Save previous Q&A if it was relevant
      if (currentQuestion && currentAnswer) {
        const score = calculateTextRelevance(currentQuestion + ' ' + currentAnswer, keywords, query)
        if (score > bestScore) {
          bestScore = score
          bestMatch = currentQuestion + '\n' + currentAnswer
        }
      }
      
      currentQuestion = line
      currentAnswer = ''
      inAnswer = false
    } else if (line.startsWith('A:')) {
      inAnswer = true
      currentAnswer = line
    } else if (inAnswer && line.trim()) {
      currentAnswer += '\n' + line
    } else if (!line.trim()) {
      inAnswer = false
    }
  }
  
  // Check the last Q&A pair
  if (currentQuestion && currentAnswer) {
    const score = calculateTextRelevance(currentQuestion + ' ' + currentAnswer, keywords, query)
    if (score > bestScore) {
      bestMatch = currentQuestion + '\n' + currentAnswer
    }
  }
  
  return bestMatch || null
}

function findRelevantGuideSection(content: string, keywords: string[], query: string): string | null {
  const sections = content.split('\n\n')
  let bestMatch = ''
  let bestScore = 0
  
  for (const section of sections) {
    const score = calculateTextRelevance(section, keywords, query)
    if (score > bestScore) {
      bestScore = score
      bestMatch = section
    }
  }
  
  return bestScore > 0 ? bestMatch : null
}

function findRelevantOptions(jsonContent: string, keywords: string[], query: string): string | null {
  try {
    const data = JSON.parse(jsonContent)
    const flatText = JSON.stringify(data, null, 2)
    
    // Search through the JSON structure for relevant content
    const sections = flatText.split('\n')
    let relevantSections: string[] = []
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const score = calculateTextRelevance(section, keywords, query)
      if (score > 0) {
        // Include context around the match
        const start = Math.max(0, i - 3)
        const end = Math.min(sections.length, i + 10)
        const contextSection = sections.slice(start, end).join('\n')
        relevantSections.push(contextSection)
        break // Take first good match to avoid too much content
      }
    }
    
    return relevantSections.length > 0 ? relevantSections[0] : null
  } catch (error) {
    console.error('Error parsing JSON content:', error)
    return null
  }
}

function calculateTextRelevance(text: string, keywords: string[], query: string): number {
  const textLower = text.toLowerCase()
  let score = 0
  
  // Only consider event-related keywords to avoid false matches
  const eventRelatedKeywords = keywords.filter(keyword => 
    isEventRelatedKeyword(keyword) || textLower.includes(keyword + ' ')
  )
  
  // Require at least 2 relevant keywords for a match
  if (eventRelatedKeywords.length < 2 && keywords.length > 2) {
    return 0
  }
  
  // Score based on keyword matches
  for (const keyword of eventRelatedKeywords) {
    if (textLower.includes(keyword)) {
      score += 1
    }
  }
  
  // Bonus for exact phrase matches
  if (textLower.includes(query)) {
    score += 3
  }
  
  // Require minimum score threshold
  return score >= 2 ? score : 0
}

function isEventRelatedKeyword(keyword: string): boolean {
  const eventKeywords = [
    'event', 'planning', 'venue', 'catering', 'wedding', 'party', 'celebration',
    'guest', 'invitation', 'budget', 'timeline', 'coordinator', 'decoration',
    'entertainment', 'food', 'service', 'reception', 'ceremony', 'corporate',
    'conference', 'meeting', 'banquet', 'dinner', 'lunch', 'cocktail',
    'capacity', 'location', 'booking', 'reservation', 'setup', 'logistics',
    'vendor', 'supplier', 'menu', 'dietary', 'restriction', 'alcohol',
    'beverage', 'music', 'photography', 'flowers', 'table', 'seating'
  ]
  
  return eventKeywords.some(eventKeyword => 
    keyword.includes(eventKeyword) || eventKeyword.includes(keyword)
  )
}

function calculateRelevanceScore(query: string, content: string): number {
  const keywords = extractQueryKeywords(query)
  return calculateTextRelevance(content, keywords, query)
}

function formatDocumentResponse(content: string, type: string): string {
  // Clean up the content for better presentation
  let formatted = content.trim()
  
  // For JSON content, make it more readable
  if (type === 'options') {
    try {
      const parsed = JSON.parse(formatted)
      formatted = formatJSONForDisplay(parsed)
    } catch (error) {
      // If parsing fails, clean up the raw JSON
      formatted = formatted
        .replace(/[{}]/g, '')
        .replace(/"/g, '')
        .replace(/,\s*\n/g, '\n')
        .trim()
    }
  }
  
  // Limit response length to avoid overwhelming users
  if (formatted.length > 800) {
    const sentences = formatted.split('. ')
    formatted = sentences.slice(0, 4).join('. ') + '.'
  }
  
  return formatted
}

function formatJSONForDisplay(obj: any, depth: number = 0): string {
  if (typeof obj === 'string') return obj
  if (typeof obj === 'number') return obj.toString()
  if (typeof obj === 'boolean') return obj.toString()
  if (obj === null) return 'null'
  
  if (Array.isArray(obj)) {
    return obj.map(item => `• ${formatJSONForDisplay(item, depth + 1)}`).join('\n')
  }
  
  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
    return entries
      .slice(0, 5) // Limit to first 5 entries
      .map(([key, value]) => {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        const formattedValue = formatJSONForDisplay(value, depth + 1)
        return `${formattedKey}: ${formattedValue}`
      })
      .join('\n')
  }
  
  return obj.toString()
}

/**
 * Enhanced search with AI synthesis and response refinement
 */
export async function searchKnowledgeWithAI(query: string, client: any): Promise<string | null> {
  // Import the refiner and config (dynamic import to avoid circular dependencies)
  const { KnowledgeResponseRefiner } = await import('./knowledge-response-refiner')
  const { refinementConfigManager, detectTopicFromQuery } = await import('./knowledge-refinement-config')
  
  // First, do the retrieval (existing logic)
  const retrievedContent = searchKnowledge(query)
  
  if (!retrievedContent) {
    return null
  }
  
  try {
    // Detect topic and get appropriate configuration
    const topic = detectTopicFromQuery(query)
    const config = refinementConfigManager.getConfigForTopic(topic)
    
    // Initialize the response refiner with topic-specific configuration
    const refiner = KnowledgeResponseRefiner.withConfig(config, client)
    
    // Refine the response to be concise and user-friendly
    const refinedResponse = await refiner.refineResponse(retrievedContent, query, {
      maxLines: config.maxLines,
      removeFileNames: config.removeFileNames,
      removeSources: config.removeSources,
      addEmojis: config.addEmojis,
      includeFollowUp: config.includeFollowUp,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    })
    
    console.info('Knowledge response refined:', {
      topic,
      originalLength: refinedResponse.originalLength,
      refinedLength: refinedResponse.refinedLength,
      confidence: refinedResponse.confidence,
      wasRefined: refinedResponse.wasRefined,
      processingTime: refinedResponse.processingTime,
      configUsed: {
        maxLines: config.maxLines,
        aiEnabled: config.aiRefinementEnabled,
        addEmojis: config.addEmojis
      }
    })
    
    return refinedResponse.content
    
  } catch (error) {
    console.warn('AI synthesis and refinement failed, falling back to basic response:', error)
    // Fallback to the basic response if AI fails
    return retrievedContent
  }
}

function generateContextualResponse(query: string, topic: string, content: string): string {
  const queryLower = query.toLowerCase()
  
  // Extract relevant sections based on query intent
  const sections = content.split('\n\n')
  const relevantSections: string[] = []
  
  // Analyze query for specific intent
  const queryIntent = analyzeQueryIntent(queryLower)
  
  // For specific questions, provide focused answers
  if (queryIntent.isSpecific) {
    // Look for sections that match the specific intent
    sections.forEach(section => {
      const sectionLower = section.toLowerCase()
      
      // Check if section contains relevant keywords from the query
      const queryKeywords = extractQueryKeywords(queryLower)
      const hasRelevantKeywords = queryKeywords.some(keyword => 
        sectionLower.includes(keyword) || 
        sectionLower.includes(keyword.replace(' ', ''))
      )
      
      if (hasRelevantKeywords) {
        relevantSections.push(section.trim())
      }
    })
    
    // If we found relevant sections, use them
    if (relevantSections.length > 0) {
      const response = relevantSections.slice(0, 2).join('\n\n') // Limit to 2 most relevant sections
      return `${response}\n\n💡 Would you like more specific information about ${topic}?`
    }
  }
  
  // For general questions, provide a summary with key points
  const summary = generateSummary(content, topic)
  return `${summary}\n\n💡 I can provide more detailed information about specific aspects of ${topic}. What would you like to know more about?`
}

function analyzeQueryIntent(query: string): { isSpecific: boolean, intent: string } {
  // Check for specific question patterns
  const specificPatterns = [
    'how to', 'how do', 'what is', 'what are', 'when should', 'where can',
    'steps', 'process', 'timeline', 'checklist', 'cost', 'price', 'budget'
  ]
  
  const isSpecific = specificPatterns.some(pattern => query.includes(pattern))
  
  // Determine intent category
  let intent = 'general'
  if (query.includes('how') || query.includes('steps') || query.includes('process')) {
    intent = 'process'
  } else if (query.includes('cost') || query.includes('budget') || query.includes('price')) {
    intent = 'cost'
  } else if (query.includes('when') || query.includes('timeline')) {
    intent = 'timing'
  } else if (query.includes('what') || query.includes('explain')) {
    intent = 'definition'
  }
  
  return { isSpecific, intent }
}

function extractQueryKeywords(query: string): string[] {
  // Remove common question words and extract meaningful keywords
  const stopWords = ['what', 'how', 'when', 'where', 'why', 'who', 'which', 'is', 'are', 'do', 'does', 'can', 'should', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'me', 'about', 'tell', 'like', 'today']
  
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word))
    .slice(0, 5) // Limit to 5 most important keywords
  
  // Only return keywords if at least one is event-related
  const hasEventKeyword = keywords.some(keyword => isEventRelatedKeyword(keyword))
  return hasEventKeyword ? keywords : []
}

function generateSummary(content: string, topic: string): string {
  // Extract the first paragraph as a summary
  const paragraphs = content.split('\n\n')
  const firstParagraph = paragraphs[0]
  
  // If the first paragraph is too long, truncate it
  if (firstParagraph.length > 200) {
    const sentences = firstParagraph.split('. ')
    const summary = sentences.slice(0, 2).join('. ')
    return `${summary}.`
  }
  
  return firstParagraph
}

export function isQuestion(text: string): boolean {
  const questionWords = ['what', 'how', 'where', 'when', 'why', 'who', 'which', 'can', 'should', 'do', 'does', 'is', 'are']
  const textLower = text.toLowerCase()
  
  // Check for question words at the beginning
  const startsWithQuestion = questionWords.some(word => textLower.startsWith(word))
  
  // Check for question mark
  const hasQuestionMark = text.includes('?')
  
  // Check for help-seeking phrases
  const helpPhrases = ['help me', 'i need', 'tell me', 'show me', 'explain', 'guide me']
  const hasHelpPhrase = helpPhrases.some(phrase => textLower.includes(phrase))
  
  return startsWithQuestion || hasQuestionMark || hasHelpPhrase
}

export function extractQuestions(text: string): string[] {
  // Simple question extraction - split by question marks and filter
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  return sentences.filter(sentence => isQuestion(sentence.trim()))
}