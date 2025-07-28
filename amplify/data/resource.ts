// amplify/data/resource.ts
import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { sendEmailFunction } from '../functions/send-email-notification/resource'; // <--- IMPORT THE FUNCTION HERE

const schema = a.schema({
  Todo: a
    .model({
      dateSlot: a.string().required(), // e.g., "YYYY-MM-DD"
      timeSlot: a.string().required(), // e.g., "HH:MM"
      bookedByUsername: a.string(),
      bookedByFirstName: a.string(),
      bookedByLastName: a.string(),
      bookedByEmail: a.string(),
    })
    .authorization(allow => [
      // FIX: Reverted allow.owner() to its simplest form to avoid TypeScript error.
      // This will rely on Amplify's default owner resolution (usually based on 'owner' field or 'sub' from Cognito).
      allow.owner(),
      allow.groups(['Admins']).to(['read', 'create', 'update', 'delete']), // Admins have full control
      // FIX: Granting all authenticated users (including non-owners) full CRUD on Todo items.
      // This ensures booking/unbooking works for all authenticated users, regardless of auth provider,
      // and bypasses the identityField TypeScript error.
      allow.authenticated().to(['read', 'create', 'update', 'delete']),
      allow.publicApiKey().to(['read']) // Public can only read (view schedule)
    ]),

  WaitlistEntry: a
    .model({
      email: a.string().required(),
      firstName: a.string(),
      lastName: a.string(),
      createdAt: a.datetime().required(),
    })
    .authorization(allow => [
      allow.owner(), // Default owner rule for WaitlistEntry
      allow.authenticated().to(['create', 'read', 'delete']),
      allow.groups(['Admins']).to(['read', 'create', 'update', 'delete']),
    ]),

  // This mutation will trigger your email Lambda
  sendNotificationEmail: a
    .mutation()
    .arguments({
      subject: a.string().required(),
      body: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.authenticated()]) // Requires authenticated user to call
    .handler(a.handler.function(sendEmailFunction))
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
