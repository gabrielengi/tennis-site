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
        'https://main.d34rismepnlcfp.amplifyapp.com/',
        'https://7c70d950d9554a4a25a8.auth.us-east-2.amazoncognito.com/oauth2/idpresponse',
        'https://d488bba46a9306055f7a.auth.us-east-2.amazoncognito.com/oauth2/idpresponse',
        'https://prod.d204uk8pvk2nwc.amplifyapp.com/',
        'https://www.grandrivertennis.ca/', // <--- ADD THIS
        'https://grandrivertennis.ca/',    // <--- ADD THIS

      ],
      logoutUrls: [
        'https://www.grandrivertennis.ca/', // <--- ADD THIS
        'https://grandrivertennis.ca/',    // <--- ADD THIS
        'http://localhost:5173/',
        'https://main.d34rismepnlcfp.amplifyapp.com/',
        'https://d488bba46a9306055f7a.auth.us-east-2.amazoncognito.com/oauth2/idpresponse',
        'https://prod.d204uk8pvk2nwc.amplifyapp.com/'
      ], // Your application's redirect URLs after logout
    }
  },
  // The API Key for data access is configured implicitly by data/resource.ts
  // when allow.publicApiKey() is used. It is not defined here in auth/resource.ts.
});
