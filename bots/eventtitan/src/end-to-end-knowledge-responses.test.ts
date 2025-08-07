/**
 * End-to-End Test Suite for Knowledge-Based Responses
 * Task 6.1: Test knowledge-based responses
 * 
 * This test suite validates that the EventTitan bot correctly responds to questions
 * with available knowledge base content, verifying response quality and relevance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock test knowledge base content
const testKnowledgeBase = {
  eventPlanning: {
    content: `Event planning is the process of organizing and coordinating all aspects of an event, from initial concept to execution. This compr