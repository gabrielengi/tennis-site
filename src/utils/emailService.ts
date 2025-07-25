// src/utils/emailService.ts
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../amplify/data/resource';

// Defines the structure of the JSON object that your Lambda actually returns.
// Note: The 'body' property itself is still a JSON string from the Lambda.
interface LambdaResponseObject {
  statusCode: number;
  body: string;
}

/**
 * Sends an email using the backend Lambda function via GraphQL mutation.
 * Handles the "double stringification" from AppSync's a.json() return type.
 *
 * @param subject The subject of the email.
 * @param body The body content of the email.
 * @returns A promise that resolves with the success message or rejects with an error.
 */
export async function sendEmail(subject: string, body: string): Promise<string> {
  const client = generateClient<Schema>();

  try {
    const graphQLResponse = await client.mutations.sendNotificationEmail({
      subject,
      body,
    });

    const rawDataString: any = graphQLResponse.data; // This will be the stringified JSON object from AppSync
    const errors = graphQLResponse.errors;

    if (errors && errors.length > 0) {
      const errorMessage = errors.map(err => err.message).join(', ');
      console.error('GraphQL errors when sending email:', errors);
      throw new Error(`Failed to send email: ${errorMessage}`);
    }

    // Step 1: Parse the outer string to get the actual JSON object
    let parsedGraphQLData: LambdaResponseObject | null = null;
    if (typeof rawDataString === 'string') {
      try {
        parsedGraphQLData = JSON.parse(rawDataString);
      } catch (e) {
        console.error("Error parsing top-level GraphQL data string:", e, "Raw string:", rawDataString);
        throw new Error(`Invalid top-level JSON response from email service.`);
      }
    } else if (rawDataString === null || rawDataString === undefined) {
        // Data might be null or undefined if the mutation itself returned nothing (e.g., specific error handling)
        throw new Error("No data received from email service.");
    } else {
        // Unexpected type for rawDataString (should be string, null, or undefined)
        console.error("Unexpected type for raw GraphQL data:", typeof rawDataString, rawDataString);
        throw new Error(`Unexpected response type from email service.`);
    }

    // Step 2: Now that we have the object, check its 'body' property (which is still a string)
    if (parsedGraphQLData && typeof parsedGraphQLData.body === 'string') {
      try {
        // Step 3: Parse the inner 'body' string to get the final message payload
        const innerMessagePayload = JSON.parse(parsedGraphQLData.body);
        const responseMessage = innerMessagePayload.message || 'Email sent successfully!';
        return responseMessage;
      } catch (parseError: any) {
        console.error('Error parsing inner email response body:', parseError, 'Raw inner body:', parsedGraphQLData.body);
        throw new Error(`Invalid inner JSON response from email service: ${parseError.message}`);
      }
    } else {
      // This case handles if parsedGraphQLData is null, or if parsedGraphQLData.body is not a string
      console.error('Email sent, but no valid message body received from GraphQL or invalid type:', parsedGraphQLData);
      throw new Error('Email sent, but no valid response data received from GraphQL.');
    }
  } catch (error: any) {
    console.error('Error in sendEmail utility:', error);
    throw new Error(`Error sending email: ${error.message || 'Unknown error'}`);
  }
}