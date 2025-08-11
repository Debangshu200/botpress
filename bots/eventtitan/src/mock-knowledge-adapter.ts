import { KnowledgeBaseAdapter, KnowledgeDocument, SearchOptions } from './knowledge-integration'

/**
 * Mock implementation of KnowledgeBaseAdapter for testing and demonstration
 * In a real implementation, this would connect to the actual Botpress knowledge base
 */
export class MockKnowledgeAdapter implements KnowledgeBaseAdapter {
  private documents: Map<string, KnowledgeDocument> = new Map()
  private nextId = 1

  async createDocument(document: KnowledgeDocument): Promise<string> {
    const id = document.id || `mock_doc_${this.nextId++}`
    const docWithId = { ...document, id }
    this.documents.set(id, docWithId)
    
    console.debug(`MockKnowledgeAdapter: Created document ${id}`, {
      title: document.title,
      source: document.source,
      tags: document.tags
    })
    
    return id
  }

  async updateDocument(id: string, updates: Partial<KnowledgeDocument>): Promise<void> {
    const existing = this.documents.get(id)
    if (!existing) {
      throw new Error(`Document ${id} not found`)
    }

    const updated = { ...existing, ...updates, id, updatedAt: new Date() }
    this.documents.set(id, updated)
    
    console.debug(`MockKnowledgeAdapter: Updated document ${id}`, {
      version: updated.version,
      updatedFields: Object.keys(updates)
    })
  }

  async findSimilarDocuments(query: string, threshold: number): Promise<KnowledgeDocument[]> {
    const queryWords = query.toLowerCase().split(/\s+/)
    const similarDocs: Array<{ doc: KnowledgeDocument; similarity: number }> = []

    for (const doc of this.documents.values()) {
      const titleWords = doc.title.toLowerCase().split(/\s+/)
      const contentWords = doc.content.toLowerCase().split(/\s+/)
      const allWords = [...titleWords, ...contentWords]
      
      const intersection = queryWords.filter(word => allWords.includes(word))
      const similarity = intersection.length / queryWords.length
      
      if (similarity >= threshold) {
        similarDocs.push({ doc, similarity })
      }
    }

    // Sort by similarity descending
    similarDocs.sort((a, b) => b.similarity - a.similarity)
    
    console.debug(`MockKnowledgeAdapter: Found ${similarDocs.length} similar documents`, {
      query,
      threshold,
      topSimilarity: similarDocs[0]?.similarity
    })
    
    return similarDocs.map(item => item.doc)
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.documents.has(id)) {
      throw new Error(`Document ${id} not found`)
    }
    
    this.documents.delete(id)
    console.debug(`MockKnowledgeAdapter: Deleted document ${id}`)
  }

  async searchDocuments(query: string, options: SearchOptions = {}): Promise<KnowledgeDocument[]> {
    const { limit = 10, offset = 0, filters = {}, sortBy = 'createdAt', sortOrder = 'desc' } = options
    
    let results = Array.from(this.documents.values())
    
    // Apply text search
    if (query) {
      const queryWords = query.toLowerCase().split(/\s+/)
      results = results.filter(doc => {
        const searchText = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase()
        return queryWords.some(word => searchText.includes(word))
      })
    }
    
    // Apply filters
    if (filters.source) {
      results = results.filter(doc => doc.source === filters.source)
    }
    if (filters.tags) {
      const filterTags = Array.isArray(filters.tags) ? filters.tags : [filters.tags]
      results = results.filter(doc => 
        filterTags.some(tag => doc.tags.includes(tag))
      )
    }
    
    // Sort results
    results.sort((a, b) => {
      let aValue: any, bValue: any
      
      switch (sortBy) {
        case 'createdAt':
          aValue = a.createdAt.getTime()
          bValue = b.createdAt.getTime()
          break
        case 'updatedAt':
          aValue = a.updatedAt.getTime()
          bValue = b.updatedAt.getTime()
          break
        case 'title':
          aValue = a.title.toLowerCase()
          bValue = b.title.toLowerCase()
          break
        case 'effectiveness':
          aValue = a.metadata.effectiveness
          bValue = b.metadata.effectiveness
          break
        default:
          aValue = a.createdAt.getTime()
          bValue = b.createdAt.getTime()
      }
      
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })
    
    // Apply pagination
    const paginatedResults = results.slice(offset, offset + limit)
    
    console.debug(`MockKnowledgeAdapter: Search returned ${paginatedResults.length} documents`, {
      query,
      totalFound: results.length,
      limit,
      offset
    })
    
    return paginatedResults
  }

  async getDocumentById(id: string): Promise<KnowledgeDocument | null> {
    const doc = this.documents.get(id)
    
    if (doc) {
      console.debug(`MockKnowledgeAdapter: Retrieved document ${id}`)
    } else {
      console.debug(`MockKnowledgeAdapter: Document ${id} not found`)
    }
    
    return doc || null
  }

  async bulkCreate(documents: KnowledgeDocument[]): Promise<string[]> {
    const ids: string[] = []
    
    for (const doc of documents) {
      const id = await this.createDocument(doc)
      ids.push(id)
    }
    
    console.debug(`MockKnowledgeAdapter: Bulk created ${ids.length} documents`)
    return ids
  }

  // Additional methods for testing and inspection

  /**
   * Gets all documents (for testing purposes)
   */
  getAllDocuments(): KnowledgeDocument[] {
    return Array.from(this.documents.values())
  }

  /**
   * Gets document count (for testing purposes)
   */
  getDocumentCount(): number {
    return this.documents.size
  }

  /**
   * Clears all documents (for testing purposes)
   */
  clearAllDocuments(): void {
    this.documents.clear()
    this.nextId = 1
    console.debug('MockKnowledgeAdapter: Cleared all documents')
  }

  /**
   * Gets documents by source (for testing purposes)
   */
  getDocumentsBySource(source: string): KnowledgeDocument[] {
    return Array.from(this.documents.values()).filter(doc => doc.source === source)
  }

  /**
   * Gets documents by tag (for testing purposes)
   */
  getDocumentsByTag(tag: string): KnowledgeDocument[] {
    return Array.from(this.documents.values()).filter(doc => doc.tags.includes(tag))
  }

  /**
   * Simulates a storage error for testing error handling
   */
  simulateError(errorType: 'create' | 'update' | 'delete' | 'search' = 'create'): void {
    const originalMethod = this[`${errorType}Document` as keyof this] as any
    
    // Replace method with error-throwing version
    (this as any)[`${errorType}Document`] = async () => {
      throw new Error(`Simulated ${errorType} error`)
    }
    
    // Restore original method after a short delay
    setTimeout(() => {
      (this as any)[`${errorType}Document`] = originalMethod
    }, 100)
  }
}