/**
 * Simplified Knowledge Handler
 * This provides basic knowledge-based responses without the plugin
 */

// Test knowledge base content
const knowledgeBase = {
  'event planning': `Event planning is the process of organizing and coordinating all aspects of an event, from initial concept to execution. This comprehensive approach includes venue selection, catering arrangements, entertainment booking, guest management, timeline coordination, and budget oversight.

Key phases of event planning:
1. Initial consultation and goal setting
2. Budget development and approval
3. Venue research and booking
4. Vendor selection and coordination
5. Timeline creation and management
6. Day-of execution and oversight`,

  'wedding planning': `Wedding planning requires careful attention to detail and timeline management. Start planning 12-18 months in advance for best results. Key steps include: setting a budget, choosing a venue, selecting vendors (photographer, caterer, florist), sending invitations, and coordinating the ceremony and reception.

Essential wedding planning timeline:
- 12-18 months before: Set budget, book venue
- 8-12 months before: Select major vendors
- 6-8 months before: Send save-the-dates
- 3-6 months before: Finalize details, send invitations
- 1-3 months before: Confirm all arrangements
- Week of: Final preparations and rehearsal`,

  'venue selection': `Venue selection is crucial for event success. Consider these factors: capacity (ensure it fits your guest count with 10% buffer), location accessibility, parking availability, catering restrictions, audio/visual equipment, decoration policies, and pricing structure.

Venue evaluation checklist:
- Capacity and layout suitability
- Location and accessibility
- Parking and transportation
- Catering kitchen and restrictions
- Audio/visual capabilities
- Decoration and setup policies
- Pricing and payment terms
- Availability for preferred dates`,

  'corporate events': `Corporate events serve various purposes: team building, product launches, conferences, and client entertainment. Key considerations include professional atmosphere, appropriate catering, AV equipment for presentations, networking opportunities, and brand representation. Budget typically ranges from $50-200 per person depending on event type and location.

Types of corporate events:
- Team building activities
- Product launch events
- Annual conferences
- Client appreciation events
- Holiday parties
- Training seminars
- Networking events`,

  'budgeting': `Event budgeting requires careful planning and contingency funds. Typical budget breakdown: venue (40-50%), catering (25-35%), entertainment (10-15%), decorations (8-10%), photography (5-8%), miscellaneous (5-10%). Always include a 10-15% contingency fund for unexpected expenses.

Budget categories to consider:
- Venue rental and setup fees
- Catering and beverage service
- Entertainment and speakers
- Decorations and flowers
- Photography and videography
- Transportation and accommodations
- Marketing and invitations
- Insurance and permits
- Contingency fund`,

  'catering': `Catering is often the largest expense after venue costs. Consider dietary restrictions, meal timing, service style (buffet vs. plated), and beverage options. Popular choices include cocktail receptions, plated dinners, and buffet-style meals. Always taste-test menu options and confirm final headcount 1-2 weeks before the event.

Catering considerations:
- Guest dietary restrictions and preferences
- Meal timing and service style
- Beverage packages and bar service
- Kitchen facilities and equipment needs
- Service staff requirements
- Setup and cleanup logistics`
}

export function searchKnowledge(query: string): string | null {
  const queryLower = query.toLowerCase()
  
  // Find matching topic
  let matchedTopic: string | null = null
  let matchedContent: string | null = null
  
  for (const [topic, content] of Object.entries(knowledgeBase)) {
    if (queryLower.includes(topic) || 
        queryLower.includes(topic.replace(' ', '')) ||
        (topic === 'event planning' && (queryLower.includes('plan') && queryLower.includes('event'))) ||
        (topic === 'wedding planning' && queryLower.includes('wedding')) ||
        (topic === 'venue selection' && queryLower.includes('venue')) ||
        (topic === 'corporate events' && queryLower.includes('corporate')) ||
        (topic === 'budgeting' && (queryLower.includes('budget') || queryLower.includes('cost'))) ||
        (topic === 'catering' && queryLower.includes('catering'))) {
      matchedTopic = topic
      matchedContent = content
      break
    }
  }
  
  if (!matchedContent || !matchedTopic) {
    return null
  }
  
  // Generate contextual response based on the query
  return generateContextualResponse(query, matchedTopic, matchedContent)
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
  const stopWords = ['what', 'how', 'when', 'where', 'why', 'who', 'which', 'is', 'are', 'do', 'does', 'can', 'should', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
  
  return query
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word))
    .slice(0, 5) // Limit to 5 most important keywords
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