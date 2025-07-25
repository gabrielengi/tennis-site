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
      allow.owner(),
      allow.groups(['Admins']).to(['read', 'create', 'update', 'delete']),
      allow.authenticated().to(['read', 'update']),
      allow.publicApiKey().to(['read'])
    ]),

  WaitlistEntry: a
    .model({
      email: a.string().required(),
      firstName: a.string(),
      lastName: a.string(),
      createdAt: a.datetime().required(),
    })
    .authorization(allow => [
      allow.owner(),
      allow.authenticated().to(['create', 'read', 'delete']),
      allow.groups(['Admins']).to(['read', 'create', 'update', 'delete']),
    ]),

  // This mutation will trigger your email Lambda
  sendNotificationEmail: a // This is the name your frontend will call
    .mutation()
    .arguments({
      subject: a.string().required(), // Your Lambda handler expects 'subject'
      body: a.string().required()     // Your Lambda handler expects 'body'
    })
    .returns(a.json()) // Lambda returns { statusCode, body } JSON
    .authorization(allow => [allow.authenticated()]) // Requires authenticated user to call
    .handler(a.handler.function(sendEmailFunction)) // <--- REFERENCE THE IMPORTED FUNCTION VARIABLE
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