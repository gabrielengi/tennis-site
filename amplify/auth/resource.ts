import { defineAuth, secret } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    // Add Google federated login here
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'), // Use secret() for client ID
        clientSecret: secret('GOOGLE_CLIENT_SECRET'), // Use secret() for client secret
        scopes: ['profile', 'openid', 'email'], // Essential scopes for user info
        attributeMapping: { // Crucial for mapping Google attributes to Cognito
          email: 'email',
          givenName: 'given_name',
          familyName: 'family_name', 
        },
      },
      callbackUrls: [ // Your application's redirect URLs after login
        'http://localhost:5173/',
        'https://7c70d950d9554a4a25a8.auth.us-east-2.amazoncognito.com/oauth2/idpresponse'
      ],
      logoutUrls: ['http://localhost:5173/'], // Your application's redirect URLs after logout
    }
  },
  userAttributes: { // Define which user attributes are available/required
    givenName: {
      required: false, // Set to true if this field must be provided during signup
    },
    familyName: {
      required: false, // Set to true if this field must be provided during signup
    },
  },
  // The API Key for data access is configured implicitly by data/resource.ts
  // when allow.publicApiKey() is used. It is not defined here in auth/resource.ts.
});
