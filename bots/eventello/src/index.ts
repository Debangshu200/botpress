import * as bp from '.botpress'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Event data interface - defines the structure of event information
 * This interface ensures type safety when working with event data
 */
interface Event {
  id: string                    // Unique identifier for the event
  title: string                 // Display name of the event
  date: string                  // Event date(s) as a string
  location: string              // Venue location
  description: string           // Brief description of the event
  capacity: number              // Maximum number of attendees
  ticketTypes: {               // Array of available ticket types
    type: string               // Internal ticket type identifier
    name: string               // Display name for the ticket
    price: number              // Price in the specified currency
    currency: string           // Currency code (e.g., 'INR', 'USD')
    available: number          // Number of tickets available
    description: string        // Description of what's included
  }[]
  schedule: string[]           // Array of schedule items
  speakers?: string[]          // Optional list of speakers
  companies?: string[]         // Optional list of participating companies
  contact: {                   // Contact information for the event
    email: string
    phone: string
    website: string
  }
}

/**
 * Booking data interface - defines the structure of booking information
 * Used to track user's booking progress throughout the conversation
 */
interface BookingData {
  eventId: string              // ID of the selected event
  eventTitle: string           // Title of the selected event
  ticketType: string           // Selected ticket type identifier
  quantity: number             // Number of tickets requested
  customerInfo?: {             // Customer information (collected during flow)
    name: string
    email: string
    phone?: string             // Optional phone number
  }
  totalPrice?: number          // Calculated total price
  bookingReference?: string    // Generated booking reference
}

/**
 * Load events from JSON files in the events directory
 * This function dynamically reads all .json files from the events folder
 * and parses them into Event objects for the bot to use
 * 
 * @returns Array of Event objects loaded from JSON files
 */
function loadEvents(): Event[] {
  const eventsDir = path.join(process.cwd(), 'events')  // Use project root directory
  const events: Event[] = []
  
  try {
    // Read all files in the events directory
    const files = fs.readdirSync(eventsDir)
    
    // Process each file in the directory
    for (const file of files) {
      // Only process JSON files
      if (file.endsWith('.json')) {
        const filePath = path.join(eventsDir, file)
        // Read and parse the JSON file
        const eventData = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        events.push(eventData)
      }
    }
  } catch (error) {
    console.error('Error loading events:', error)
  }
  
  return events
}

/**
 * Generate a unique booking reference
 * Creates a unique identifier for each booking using timestamp and random string
 * Format: EVT-[TIMESTAMP]-[RANDOM] (e.g., EVT-ABC123-XYZ45)
 * 
 * @returns Unique booking reference string
 */
function generateBookingReference(): string {
  // Convert current timestamp to base36 for shorter string
  const timestamp = Date.now().toString(36)
  // Generate random string (5 characters)
  const random = Math.random().toString(36).substr(2, 5)
  // Combine with prefix and convert to uppercase
  return `EVT-${timestamp}-${random}`.toUpperCase()
}

/**
 * Format currency amounts for display
 * Handles different currencies with proper formatting and localization
 * 
 * @param amount - Numeric amount to format
 * @param currency - Currency code (defaults to 'INR')
 * @returns Formatted currency string
 */
function formatCurrency(amount: number, currency: string = 'INR'): string {
  if (currency === 'INR') {
    // Use Indian number formatting with rupee symbol
    return `₹${amount.toLocaleString('en-IN')}`
  }
  // For other currencies, use simple format
  return `${currency} ${amount}`
}

/**
 * CONVERSATION STATE MANAGEMENT
 * 
 * The bot maintains conversation state for each user to track their progress
 * through the booking flow. This is stored in-memory and will reset when
 * the bot restarts (in production, consider using persistent storage).
 */

/**
 * In-memory storage for conversation states
 * Key: conversationId (unique identifier for each conversation)
 * Value: Object containing current step and booking progress
 */
const conversationStates = new Map<string, {
  step: string                    // Current step in the booking flow
  selectedEvent?: Event           // Event selected by the user
  bookingDetails?: Partial<BookingData>  // Accumulated booking information
}>()

/**
 * Get the current conversation state for a user
 * If no state exists, creates a new one starting at 'welcome' step
 * 
 * @param conversationId - Unique identifier for the conversation
 * @returns Current conversation state object
 */
function getConversationState(conversationId: string) {
  if (!conversationStates.has(conversationId)) {
    // Initialize new conversation with welcome step
    conversationStates.set(conversationId, { step: 'welcome' })
  }
  return conversationStates.get(conversationId)!
}

/**
 * Update the conversation state with new information
 * Merges the updates with existing state to preserve data
 * 
 * @param conversationId - Unique identifier for the conversation
 * @param updates - Object containing state updates to apply
 */
function updateConversationState(conversationId: string, updates: any) {
  const state = getConversationState(conversationId)
  // Merge existing state with updates
  conversationStates.set(conversationId, { ...state, ...updates })
}

/**
 * BOT INITIALIZATION AND CUSTOM ACTIONS
 * 
 * The bot is initialized with custom actions that can be called from the conversation flow
 * These actions handle business logic like event retrieval, booking validation, and booking creation
 */
const bot = new bp.Bot({
  actions: {
    /**
     * Get all available events from the events directory
     * This action loads all event JSON files and returns them as an array
     * 
     * @returns Object containing array of all available events
     */
    getAvailableEvents: async () => {
      const events = loadEvents()
      return { events }
    },
    
    /**
     * Validate a booking request before processing
     * Checks if the event exists, ticket type is valid, and sufficient tickets are available
     * 
     * @param input - Object containing eventId, ticketType, and quantity
     * @returns Object with validation result and optional total price
     */
    validateBooking: async ({ input }: any) => {
      const { eventId, ticketType, quantity } = input
      const events = loadEvents()
      const event = events.find(e => e.id === eventId)
      
      // Check if event exists
      if (!event) {
        return { valid: false, message: 'Event not found' }
      }
      
      // Check if ticket type exists for this event
      const ticket = event.ticketTypes.find(t => t.type === ticketType)
      if (!ticket) {
        return { valid: false, message: 'Ticket type not found' }
      }
      
      // Check if enough tickets are available
      if (ticket.available < quantity) {
        return { 
          valid: false, 
          message: `Only ${ticket.available} tickets available for ${ticket.name}` 
        }
      }
      
      // Calculate total price and return success
      const totalPrice = ticket.price * quantity
      return { 
        valid: true, 
        message: 'Booking is valid', 
        totalPrice 
      }
    },
    
    /**
     * Create and save a new booking
     * Validates the booking, generates a unique reference, and saves to file system
     * 
     * @param input - Object containing eventId, ticketType, quantity, and customerInfo
     * @returns Object with success status, booking reference, and total price
     */
    createBooking: async ({ input }: any) => {
      const { eventId, ticketType, quantity, customerInfo } = input
      const events = loadEvents()
      const event = events.find(e => e.id === eventId)
      
      // Validate event exists
      if (!event) {
        return { success: false, bookingReference: '', totalPrice: 0 }
      }
      
      // Validate ticket type and availability
      const ticket = event.ticketTypes.find(t => t.type === ticketType)
      if (!ticket || ticket.available < quantity) {
        return { success: false, bookingReference: '', totalPrice: 0 }
      }
      
      // Calculate total price and generate booking reference
      const totalPrice = ticket.price * quantity
      const bookingReference = generateBookingReference()
      
      // Create comprehensive booking data object
      const bookingData = {
        bookingReference,
        eventId,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location,
        ticketType: ticket.type,
        ticketName: ticket.name,
        quantity,
        totalPrice,
        currency: ticket.currency,
        customerInfo,
        bookingDate: new Date().toISOString(),
        status: 'confirmed'
      }
      
      try {
        // Ensure bookings directory exists
        const bookingsDir = path.join(__dirname, '../bookings')
        if (!fs.existsSync(bookingsDir)) {
          fs.mkdirSync(bookingsDir, { recursive: true })
        }
        
        // Save booking to JSON file
        const bookingFile = path.join(bookingsDir, `${bookingReference}.json`)
        fs.writeFileSync(bookingFile, JSON.stringify(bookingData, null, 2))
        
        console.log('Booking saved:', bookingReference)
      } catch (error) {
        console.error('Error saving booking:', error)
      }
      
      return { success: true, bookingReference, totalPrice }
    }
  }
})

/**
 * MAIN MESSAGE HANDLER
 * 
 * This is the central message processing function that handles all incoming messages
 * It uses a state machine pattern to route messages to appropriate handlers based on
 * the current conversation step
 */
bot.on.message('*', async ({ message, client, ctx }) => {
  // Extract conversation details from the message
  const conversationId = (message as any).conversationId
  const userMessage = ((message as any).payload?.text || '').toLowerCase().trim()
  const state = getConversationState(conversationId)
  
  try {
    // Route to appropriate handler based on current conversation step
    switch (state.step) {
      case 'welcome':
        await handleWelcome(client, ctx, conversationId, userMessage)
        break
        
      case 'event-selection':
        await handleEventSelection(client, ctx, conversationId, userMessage)
        break
        
      case 'ticket-selection':
        await handleTicketSelection(client, ctx, conversationId, userMessage)
        break
        
      case 'quantity-selection':
        await handleQuantitySelection(client, ctx, conversationId, userMessage)
        break
        
      case 'personal-details':
        await handlePersonalDetails(client, ctx, conversationId, userMessage)
        break
        
      case 'confirmation':
        await handleConfirmation(client, ctx, conversationId, userMessage)
        break
        
      default:
        // Fallback to welcome handler for unknown states
        await handleWelcome(client, ctx, conversationId, userMessage)
    }
  } catch (error) {
    // Global error handling - restart conversation on any error
    console.error('Error handling message:', error)
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: 'Sorry, something went wrong. Let me restart our conversation. Type "events" to see available events.'
      }
    })
    // Reset conversation state to welcome
    updateConversationState(conversationId, { step: 'welcome' })
  }
})

/**
 * CONVERSATION FLOW HANDLERS
 * 
 * These functions handle each step of the booking conversation flow
 * Each handler is responsible for processing user input and advancing the conversation
 */

/**
 * Handle the welcome/initial state of the conversation
 * Detects if user wants to see events or provides general welcome message
 * 
 * @param client - Botpress client for sending messages
 * @param ctx - Conversation context containing bot information
 * @param conversationId - Unique identifier for this conversation
 * @param userMessage - User's input message (lowercase and trimmed)
 */
async function handleWelcome(client: any, ctx: any, conversationId: string, userMessage: string) {
  // Check if user is asking about events, booking, or tickets
  if (userMessage.includes('event') || userMessage === 'events' || userMessage.includes('ticket') || userMessage.includes('ticket')) {
    // Load all available events from JSON files
    const events = loadEvents()
    
    if(events.length === 0) {
      await (client as any).createmessage({
        conversationId,
        userId: ctx.botId,
        tags: {},
        type: 'text',
        payload: {text: "Sorry, no events are currently available."}
      })
      return
    }
    
    // Build formatted list of events with details
    let eventsList = "🎉 Available Events\n\n"
    events.forEach((event, index) => {
      eventsList += `${index + 1}. ${event.title}\n`
      eventsList += `📅 ${event.date}\n`
      eventsList += `📍 ${event.location}\n`
      eventsList += `${event.description}\n\n`
    })
    
    eventsList += "Reply with the event number (1, 2, etc.) to book tickets!"
    
    // Send events list to user
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: { text: eventsList }
    })
    
    // Move to event selection step
    updateConversationState(conversationId, { step: 'event-selection' })
  } else {
    // Send general welcome message if user didn't ask about events
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: "👋 Welcome to EventBooking Bot!\n\nI can help you book tickets for upcoming events. Type 'events' to see what's available!"
      }
    })
  }
}

/**
 * Handle event selection step of the conversation
 * User selects an event by entering a number (1, 2, 3, etc.)
 * Shows detailed ticket information for the selected event
 * 
 * @param client - Botpress client for sending messages
 * @param ctx - Conversation context containing bot information
 * @param conversationId - Unique identifier for this conversation
 * @param userMessage - User's input message (should be a number)
 */
async function handleEventSelection(client: any, ctx: any, conversationId: string, userMessage: string) {
  const events = loadEvents()
  const eventNumber = parseInt(userMessage)
  
  // Check if user entered a valid event number
  if (eventNumber >= 1 && eventNumber <= events.length) {
    // Get the selected event (arrays are 0-indexed, so subtract 1)
    const selectedEvent = events[eventNumber - 1]
    
    // Build detailed ticket information display
    let ticketInfo = `🎫 ${selectedEvent.title}\n\n`
    ticketInfo += `📅 ${selectedEvent.date}\n`
    ticketInfo += `📍 ${selectedEvent.location}\n\n`
    ticketInfo += "Available Tickets:\n\n"
    
    // List all ticket types with pricing and availability
    selectedEvent.ticketTypes.forEach((ticket, index) => {
      ticketInfo += `${index + 1}. ${ticket.name}\n`
      ticketInfo += `💰 ${formatCurrency(ticket.price, ticket.currency)}\n`
      ticketInfo += `📦 ${ticket.available} available\n`
      ticketInfo += `ℹ️ ${ticket.description}\n\n`
    })
    
    ticketInfo += "Reply with the ticket number to select your ticket type!"
    
    // Send ticket information to user
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: { text: ticketInfo }
    })
    
    // Update conversation state with selected event and move to ticket selection
    updateConversationState(conversationId, { 
      step: 'ticket-selection',
      selectedEvent,
      bookingDetails: { eventId: selectedEvent.id, eventTitle: selectedEvent.title }
    })
  } else {
    // Handle invalid event number input
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: "Please enter a valid event number (1, 2, etc.) or type 'events' to see the list again."
      }
    })
  }
}

/**
 * Handle ticket selection step of the conversation
 * User selects a ticket type by entering a number (1, 2, 3, etc.)
 * Shows selected ticket details and asks for quantity
 * 
 * @param client - Botpress client for sending messages
 * @param ctx - Conversation context containing bot information
 * @param conversationId - Unique identifier for this conversation
 * @param userMessage - User's input message (should be a ticket number)
 */
async function handleTicketSelection(client: any, ctx: any, conversationId: string, userMessage: string) {
  const state = getConversationState(conversationId)
  const ticketNumber = parseInt(userMessage)
  
  // Check if user entered a valid ticket number and we have a selected event
  if (state.selectedEvent && ticketNumber >= 1 && ticketNumber <= state.selectedEvent.ticketTypes.length) {
    // Get the selected ticket type (arrays are 0-indexed, so subtract 1)
    const selectedTicket = state.selectedEvent.ticketTypes[ticketNumber - 1]
    
    // Confirm ticket selection and ask for quantity
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: `Great choice! You selected ${selectedTicket.name} for ${formatCurrency(selectedTicket.price, selectedTicket.currency)}.\n\nHow many tickets would you like? (Available: ${selectedTicket.available})`
      }
    })
    
    // Update conversation state with selected ticket type and move to quantity selection
    updateConversationState(conversationId, {
      step: 'quantity-selection',
      bookingDetails: {
        ...state.bookingDetails,
        ticketType: selectedTicket.type
      }
    })
  } else {
    // Handle invalid ticket number input
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: "Please enter a valid ticket number."
      }
    })
  }
}

/**
 * Handle quantity selection step of the conversation
 * User enters the number of tickets they want to purchase (1-10)
 * Validates availability and calculates total price
 * 
 * @param client - Botpress client for sending messages
 * @param ctx - Conversation context containing bot information
 * @param conversationId - Unique identifier for this conversation
 * @param userMessage - User's input message (should be a number between 1-10)
 */
async function handleQuantitySelection(client: any, ctx: any, conversationId: string, userMessage: string) {
  const state = getConversationState(conversationId)
  const quantity = parseInt(userMessage)
  
  // Check if quantity is within valid range (1-10 tickets)
  if (quantity >= 1 && quantity <= 10) {
    // Load events and find the selected event and ticket type
    const events = loadEvents()
    const event = events.find(e => e.id === state.bookingDetails!.eventId!)
    const ticket = event?.ticketTypes.find(t => t.type === state.bookingDetails!.ticketType!)
    
    // Validate that event and ticket exist, and sufficient tickets are available
    if (event && ticket && ticket.available >= quantity) {
      // Calculate total price for the requested quantity
      const totalPrice = ticket.price * quantity
      
      // Confirm quantity and price, then ask for personal details
      await (client as any).createMessage({
        conversationId,
        userId: ctx.botId,
        tags: {},
        type: 'text',
        payload: {
          text: `Perfect! ${quantity} ticket(s) for ${formatCurrency(totalPrice, 'INR')}.\n\nNow I need your details:\n\nPlease provide your full name:`
        }
      })
      
      // Update conversation state with quantity and total price, move to personal details
      updateConversationState(conversationId, {
        step: 'personal-details',
        bookingDetails: {
          ...state.bookingDetails,
          quantity,
          totalPrice
        }
      })
    } else {
      // Handle case where not enough tickets are available
      await (client as any).createMessage({
        conversationId,
        userId: ctx.botId,
        tags: {},
        type: 'text',
        payload: {
          text: `Sorry, only ${ticket?.available || 0} tickets available. Please choose a different quantity.`
        }
      })
    }
  } else {
    // Handle invalid quantity input (outside 1-10 range)
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: "Please enter a valid quantity (1-10 tickets)."
      }
    })
  }
}

/**
 * Handle personal details collection step of the conversation
 * Collects customer information in sequence: name → email → phone (optional)
 * Uses a multi-step approach within this single handler function
 * 
 * @param client - Botpress client for sending messages
 * @param ctx - Conversation context containing bot information
 * @param conversationId - Unique identifier for this conversation
 * @param userMessage - User's input message (name, email, or phone number)
 */
async function handlePersonalDetails(client: any, ctx: any, conversationId: string, userMessage: string) {
  const state = getConversationState(conversationId)
  
  // Step 1: Collect customer name (first time through this handler)
  if (!state.bookingDetails!.customerInfo) {
    // Initialize customer info with the provided name
    updateConversationState(conversationId, {
      bookingDetails: {
        ...state.bookingDetails,
        customerInfo: { name: userMessage, email: '', phone: '' }
      }
    })
    
    // Ask for email address next
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: `Thanks ${userMessage}! Now please provide your email address:`
      }
    })
  } 
  // Step 2: Collect and validate email address
  else if (!state.bookingDetails!.customerInfo!.email) {
    // Basic email validation (contains @ and .)
    if (userMessage.includes('@') && userMessage.includes('.')) {
      // Save valid email address
      updateConversationState(conversationId, {
        bookingDetails: {
          ...state.bookingDetails,
          customerInfo: {
            ...state.bookingDetails!.customerInfo!,
            email: userMessage
          }
        }
      })
      
      // Ask for optional phone number
      await (client as any).createMessage({
        conversationId,
        userId: ctx.botId,
        tags: {},
        type: 'text',
        payload: {
          text: "Great! Phone number (optional - type 'skip' to skip):"
        }
      })
    } else {
      // Handle invalid email format
      await (client as any).createMessage({
        conversationId,
        userId: ctx.botId,
        tags: {},
        type: 'text',
        payload: {
          text: "Please enter a valid email address."
        }
      })
    }
  } 
  // Step 3: Collect optional phone number and show booking summary
  else {
    // Save phone number if provided (skip if user typed 'skip')
    if (userMessage !== 'skip') {
      updateConversationState(conversationId, {
        bookingDetails: {
          ...state.bookingDetails,
          customerInfo: {
            ...state.bookingDetails!.customerInfo!,
            phone: userMessage
          }
        }
      })
    }
    
    // All personal details collected - generate booking summary
    const booking = state.bookingDetails!
    const event = state.selectedEvent!
    const ticket = event.ticketTypes.find(t => t.type === booking.ticketType)!
    
    // Build comprehensive booking summary for user review
    let summary = "📋 Booking Summary\n\n"
    summary += `🎉 Event: ${booking.eventTitle}\n`
    summary += `🎫 Ticket: ${ticket.name}\n`
    summary += `🔢 Quantity: ${booking.quantity}\n`
    summary += `💰 Total: ${formatCurrency(booking.totalPrice!, ticket.currency)}\n\n`
    summary += `👤 Name: ${booking.customerInfo!.name}\n`
    summary += `📧 Email: ${booking.customerInfo!.email}\n`
    // Only show phone if provided
    if (booking.customerInfo!.phone) {
      summary += `📱 **Phone:** ${booking.customerInfo!.phone}\n`
    }
    summary += "\nType 'confirm' to complete your booking or 'cancel' to start over."
    
    // Send booking summary to user
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: { text: summary }
    })
    
    // Move to final confirmation step
    updateConversationState(conversationId, { step: 'confirmation' })
  }
}

/**
 * Handle the final confirmation step of the conversation
 * User can either confirm the booking, cancel it, or get prompted for valid input
 * This is where the actual booking is created and saved to the file system
 * 
 * @param client - Botpress client for sending messages
 * @param ctx - Conversation context containing bot information
 * @param conversationId - Unique identifier for this conversation
 * @param userMessage - User's input message (should be 'confirm' or 'cancel')
 */
async function handleConfirmation(client: any, ctx: any, conversationId: string, userMessage: string) {
  const state = getConversationState(conversationId)
  
  // Handle booking confirmation
  if (userMessage === 'confirm') {
    const booking = state.bookingDetails!
    
    // Load events to get fresh data and validate booking is still possible
    const events = loadEvents()
    const event = events.find(e => e.id === booking.eventId!)
    const ticket = event?.ticketTypes.find(t => t.type === booking.ticketType!)
    
    // Ensure event and ticket still exist (data integrity check)
    if (event && ticket) {
      // Generate unique booking reference and get final price
      const bookingReference = generateBookingReference()
      const totalPrice = booking.totalPrice!
      
      // Create comprehensive booking record with all necessary information
      const bookingData = {
        bookingReference,
        eventId: booking.eventId,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location,
        ticketType: ticket.type,
        ticketName: ticket.name,
        quantity: booking.quantity,
        totalPrice,
        currency: ticket.currency,
        customerInfo: booking.customerInfo,
        bookingDate: new Date().toISOString(),
        status: 'confirmed'
      }
      
      try {
        // Ensure bookings directory exists
        const bookingsDir = path.join(process.cwd(), 'bookings')
        if (!fs.existsSync(bookingsDir)) {
          fs.mkdirSync(bookingsDir, { recursive: true })
        }
        
        // Save booking to JSON file with booking reference as filename
        const bookingFile = path.join(bookingsDir, `${bookingReference}.json`)
        fs.writeFileSync(bookingFile, JSON.stringify(bookingData, null, 2))
        
        // Build confirmation message with all booking details
        let confirmation = "✅ Booking Confirmed!\n\n"
        confirmation += `🎫 Booking Reference: ${bookingReference}\n`
        confirmation += `💰 Total Paid: ${formatCurrency(totalPrice, ticket.currency)}\n\n`
        confirmation += `📧 A confirmation email will be sent to ${booking.customerInfo!.email}\n\n`
        confirmation += `For any queries, contact: ${event.contact.email}\n\n`
        confirmation += "Thank you for booking with us! 🎉"
        
        // Send confirmation message to user
        await (client as any).createMessage({
          conversationId,
          userId: ctx.botId,
          tags: {},
          type: 'text',
          payload: { text: confirmation }
        })
      } catch (error) {
        // Handle file system errors during booking save
        console.error('Error saving booking:', error)
        await (client as any).createMessage({
          conversationId,
          userId: ctx.botId,
          tags: {},
          type: 'text',
          payload: {
            text: "Sorry, there was an error processing your booking. Please try again."
          }
        })
      }
    }
    
    // Reset conversation state to welcome for new bookings
    updateConversationState(conversationId, { step: 'welcome' })
    
  } 
  // Handle booking cancellation
  else if (userMessage === 'cancel') {
    // Send cancellation confirmation and reset conversation
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: "Booking cancelled. Type 'events' to start a new booking."
      }
    })
    
    // Reset conversation state to welcome
    updateConversationState(conversationId, { step: 'welcome' })
  } 
  // Handle invalid input (not 'confirm' or 'cancel')
  else {
    // Prompt user for valid input
    await (client as any).createMessage({
      conversationId,
      userId: ctx.botId,
      tags: {},
      type: 'text',
      payload: {
        text: "Please type 'confirm' to complete your booking or 'cancel' to start over."
      }
    })
  }
}

export default bot