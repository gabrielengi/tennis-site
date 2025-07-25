import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda'; // <--- ADD THIS IMPORT for 'lambda.Function' type
import { sendEmailFunction } from './functions/send-email-notification/resource'; // <--- Ensure consistent name

const backend = defineBackend({
  auth,
  data,
  sendEmailFunction, // <--- Consistent name
});

// Type assert to the concrete Function class to access addEnvironment
const lambdaFunction = backend.sendEmailFunction.resources.lambda as lambda.Function; // <--- THE FIX IS HERE

lambdaFunction.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'], // IMPORTANT: In a production environment, restrict this to specific verified SES identities (ARNs) for better security.
  })
);

// Add Environment Variables: These will be available in your Lambda handler via process.env.VAR_NAME
lambdaFunction.addEnvironment(
  'SENDER_EMAIL',
  'gabriel.jsh@gmail.com' // Replace with your VERIFIED SES sender email
);

lambdaFunction.addEnvironment(
  'RECIPIENT_EMAIL',
  'gabriel.jsh@gmail.com' // Replace with your recipient email
);