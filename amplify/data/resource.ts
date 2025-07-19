// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  Todo: a
    .model({
      dateSlot: a.string().required(), // e.g., "YYYY-MM-DD"
      timeSlot: a.string().required(), // e.g., "HH:MM"
      bookedByUsername: a.string(), // The username (e.g., google_112...)
      bookedByFirstName: a.string(), // Booker's first name
      bookedByLastName: a.string(),  // Booker's last name
      bookedByEmail: a.string(),     // Booker's email
    })
    .authorization(allow => [
      allow.owner(), // Owner can do anything to their own booked slot (read, create, update, delete)
      allow.groups(['Admins']).to(['read', 'create', 'update', 'delete']), // Admins have full control over all Todo items
      // Authenticated users need 'read' to see the schedule and 'update' to book/unbook slots.
      // 'create' is not needed here as Todo items are pre-created by the initial data setup.
      allow.authenticated().to(['read', 'update']),
      allow.publicApiKey().to(['read']) // Public (unauthenticated) users can read all Todo items (view schedule)
    ]),

  WaitlistEntry: a
    .model({
      email: a.string().required(),
      firstName: a.string(), // ADDED firstName
      lastName: a.string(),  // ADDED lastName
      createdAt: a.datetime().required(), // Using datetime for consistency and proper sorting
    })
    .authorization(allow => [
      allow.owner(), // Only the owner can read/update/delete their waitlist entry
      // CRITICAL FIX: Authenticated users need 'create', 'read', and 'delete' permission to manage their waitlist status.
      allow.authenticated().to(['create', 'read', 'delete']),
      allow.groups(['Admins']).to(['read', 'create', 'update', 'delete']), // Admins can manage all waitlist entries
      // Removed allow.guest().to(['read']) and allow.publicApiKey().to(['read']) for WaitlistEntry
      // as waitlist entries are typically private to authenticated users and admins.
      // If public read is desired, these can be re-added carefully.
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool', // Ensures authenticated users use User Pool auth by default
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
