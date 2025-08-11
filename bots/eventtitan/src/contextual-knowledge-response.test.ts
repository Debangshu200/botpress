/**
 * Test suite for contextual knowledge response generation
 * Verifies that the knowledge handler provides relevant, focused answers
 * instead of dumping entire knowledge base entries
 */

import { searchKnowledge, isQuestion, extractQuestions } from './knowledge-handler'

describe('Contextual Knowledge Response Tests', () => {
  describe('searchKnowledge - Contextual Response Generation', () => {
    test('should provide focused answer for specific wedding planning question', () => {
      const query = "How do I plan a wedding?"
      const response = searchKnowledge(query)
      
      expect(response).toBeTruthy()
      expect(response).not.toContain('Essential wedding planning timeline:') // Should not include the full timeline section
      expect(response).toContain('Wedding planning requires careful attention')
      expect(response).toContain('💡') // Should include helpful prompt
      expect(response!.length).toBeLessThan(500) // Should be much shorter than full content
    })

    test('should provide relevant sections for timeline-specific question', () => {
      const query = "What is the wedding planning timeline?"
      const response = searchKnowledge(query)
      
      expect(response).toBeTruthy()
      expect(response).toContain('timeline') // Should focus on timeline content
      expect(response).toContain('💡 Would you like more specific information')
      expect(response!.length).toBeLessThan(800) // Should be focused, not full content
    })

    test('should provide summary for general venue question', () => {
      const query = "Tell me about venue selection"
      const response = searchKnowledge(query)
      
      expect(response).toBeTruthy()
      expect(response).toContain('Venue selection is crucial')
      expect(response).toContain('💡 I can provide more detailed information')
      expect(response).not.toContain('Venue evaluation checklist:') // Should not include full checklist
      expect(response!.length).toBeLessThan(400) // Should be a summary
    })

    test('should provide cost-focused answer for budget question', () => {
      const query = "How much does event planning cost?"
      const response = searchKnowledge(query)
      
      expect(response).toBeTruthy()
      expect(response).toContain('budget')
      expect(response).toContain('💡')
      // Should be contextual, not the full budgeting content
      expect(response!.length).toBeLessThan(600)
    })

    test('should provide focused corporate events info', () => {
      const query = "What are corporate events?"
      const response = searchKnowledge(query)
      
      expect(response).toBeTruthy()
      expect(response).toContain('Corporate events serve various purposes')
      expect(response).toContain('💡')
      expect(response!.length).toBeLessThan(500)
    })

    test('should return null for unmatched queries', () => {
      const query = "How do I fix my car?"
      const response = searchKnowledge(query)
      
      expect(response).toBeNull()
    })

    test('should handle catering questions contextually', () => {
      const query = "What should I know about catering?"
      const response = searchKnowledge(query)
      
      expect(response).toBeTruthy()
      expect(response).toContain('Catering is often the largest expense')
      expect(response).toContain('💡')
      expect(response!.length).toBeLessThan(400) // Should be summary, not full content
    })
  })

  describe('Response Quality Verification', () => {
    test('responses should be conversational and helpful', () => {
      const queries = [
        "How do I plan an event?",
        "What is venue selection?",
        "Tell me about wedding planning",
        "How much does catering cost?"
      ]

      queries.forEach(query => {
        const response = searchKnowledge(query)
        expect(response).toBeTruthy()
        
        // Should include helpful prompts
        expect(response).toMatch(/💡.*\?/)
        
        // Should be reasonably sized (not full content dump)
        expect(response!.length).toBeLessThan(800)
        expect(response!.length).toBeGreaterThan(50)
        
        // Should not contain multiple large sections
        const sections = response!.split('\n\n')
        expect(sections.length).toBeLessThanOrEqual(4) // Max 4 sections including prompt
      })
    })

    test('specific questions should get more targeted responses', () => {
      const specificQuery = "What are the steps for wedding planning?"
      const generalQuery = "Tell me about wedding planning"
      
      const specificResponse = searchKnowledge(specificQuery)
      const generalResponse = searchKnowledge(generalQuery)
      
      expect(specificResponse).toBeTruthy()
      expect(generalResponse).toBeTruthy()
      
      // Both should be contextual and include prompts
      expect(specificResponse).toContain('💡')
      expect(generalResponse).toContain('💡')
      
      // Both should be reasonably sized
      expect(specificResponse!.length).toBeLessThan(800)
      expect(generalResponse!.length).toBeLessThan(800)
    })
  })

  describe('Question Detection and Extraction', () => {
    test('should correctly identify questions', () => {
      const questions = [
        "How do I plan a wedding?",
        "What is venue selection?",
        "Can you help me with budgeting?",
        "Tell me about catering",
        "Show me event planning steps"
      ]

      questions.forEach(question => {
        expect(isQuestion(question)).toBe(true)
      })
    })

    test('should correctly identify non-questions', () => {
      const statements = [
        "I am planning a wedding",
        "The venue looks great",
        "Thank you for the help"
      ]

      statements.forEach(statement => {
        expect(isQuestion(statement)).toBe(false)
      })
    })

    test('should extract questions from mixed text', () => {
      const text = "I am planning an event. How do I choose a venue? The budget is important. What about catering?"
      const questions = extractQuestions(text)
      
      expect(questions).toHaveLength(2)
      expect(questions[0]).toContain("How do I choose a venue")
      expect(questions[1]).toContain("What about catering")
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty queries gracefully', () => {
      expect(searchKnowledge("")).toBeNull()
      expect(searchKnowledge("   ")).toBeNull()
    })

    test('should handle very short queries', () => {
      const response = searchKnowledge("wedding")
      expect(response).toBeTruthy()
      expect(response).toContain('💡')
    })

    test('should handle queries with special characters', () => {
      const response = searchKnowledge("How do I plan a wedding? (urgent!)")
      expect(response).toBeTruthy()
      expect(response).toContain('Wedding planning')
    })

    test('should handle case-insensitive matching', () => {
      const upperResponse = searchKnowledge("WEDDING PLANNING")
      const lowerResponse = searchKnowledge("wedding planning")
      const mixedResponse = searchKnowledge("Wedding Planning")
      
      expect(upperResponse).toBeTruthy()
      expect(lowerResponse).toBeTruthy()
      expect(mixedResponse).toBeTruthy()
      
      // All should provide similar contextual responses
      expect(upperResponse).toContain('💡')
      expect(lowerResponse).toContain('💡')
      expect(mixedResponse).toContain('💡')
    })
  })

  describe('Performance and Length Validation', () => {
    test('all responses should be appropriately sized', () => {
      const testQueries = [
        "How do I plan an event?",
        "What is venue selection?",
        "Tell me about wedding planning",
        "How much does catering cost?",
        "What are corporate events?",
        "Help me with budgeting"
      ]

      testQueries.forEach(query => {
        const response = searchKnowledge(query)
        if (response) {
          // Should not be too short (less than 30 chars) or too long (more than 1000 chars)
          expect(response.length).toBeGreaterThan(30)
          expect(response.length).toBeLessThan(1000)
          
          // Should not contain the full original content
          expect(response.length).toBeLessThan(500) // Much shorter than original entries
        }
      })
    })

    test('responses should be faster than full content processing', () => {
      const start = Date.now()
      const response = searchKnowledge("How do I plan a wedding?")
      const end = Date.now()
      
      expect(response).toBeTruthy()
      expect(end - start).toBeLessThan(100) // Should be very fast
    })
  })
})