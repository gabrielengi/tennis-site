// amplify/functions/send-email-notification/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const sendEmailFunction = defineFunction({ // <-- Renamed this to sendEmailFunction for consistency
  name: 'sendEmailFunction',
  entry: './handler.ts',
  runtime: 20,
});