import * as sdk from '@botpress/sdk'

export default new sdk.BotDefinition({
  integrations: {
    whatsapp: {
      name: 'whatsapp',
      version: '0.2.0',
      type: 'integration',
      definition: {
        name: 'whatsapp',
        version: '0.2.0'
      }
    }
  },

  actions: {
    // First action  - Get all the available events
    getAvailableEvents: {
      title: 'Get Available Events',
      description: 'Retrieve list of available events',
      input: {
        schema: sdk.z.object({})
      },
      output: {
        schema: sdk.z.object({
          events: sdk.z.array(sdk.z.object({
            id: sdk.z.string(),
            title: sdk.z.string(),
            date: sdk.z.string(),
            location: sdk.z.string(),
            description: sdk.z.string(),
            ticketTypes: sdk.z.array(sdk.z.object({
              type: sdk.z.string(),
              price: sdk.z.number(),
              available: sdk.z.number()
            }))
          }))
        })
      }
    },
    // second action - validate booking details
    validateBooking: {
      title: 'Validate Booking',
      description: 'Validate booking details and availability',
      input: {
        schema: sdk.z.object({
          eventId: sdk.z.string(),
          ticketType: sdk.z.string(),
          quantity: sdk.z.number()
        })
      },
      output: {
        schema: sdk.z.object({
          valid: sdk.z.boolean(),
          message: sdk.z.string(),
          totalPrice: sdk.z.number().optional()
        })
      }
    },
    // Third action - creating booking for the event 
    createBooking: {
      title: 'Create Booking',
      description: 'Create a new event booking',
      input: {
        schema: sdk.z.object({
          eventId: sdk.z.string(),
          ticketType: sdk.z.string(),
          quantity: sdk.z.number(),
          customerInfo: sdk.z.object({
            name: sdk.z.string(),
            email: sdk.z.string(),
            phone: sdk.z.string().optional()
          })
        })
      },
      output: {
        schema: sdk.z.object({
          bookingReference: sdk.z.string(),
          totalPrice: sdk.z.number(),
          success: sdk.z.boolean()
        })
      }
    }
  }
})
