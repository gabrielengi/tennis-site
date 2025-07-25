// src/utils/emailService.ts
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../amplify/data/resource';

interface SendEmailMutationData {
  statusCode: number;
  body: string;
}

// REMOVE this line from here:
// const client = generateClient<Schema>();

/**
 * Sends an email using the backend Lambda function via GraphQL mutation.
 * @param subject The subject of the email.
 * @param body The body content of the email.
 * @returns A promise that resolves with the success message or rejects with an error.
 */
export async function sendEmail(subject: string, body: string): Promise<string> {
  // ADD this line here, inside the function:
  const client = generateClient<Schema>();

  try {
    console.log("Attempting to send email with subject:", subject, "and body:", body);

    const { data, errors } = await client.mutations.sendNotificationEmail({
      subject,
      body,
    }) as { data?: SendEmailMutationData | null; errors?: any[] };

    if (errors) {
      const errorMessage = errors.map(err => err.message).join(', ');
      console.error('GraphQL errors when sending email:', errors);
      throw new Error(`Failed to send email: ${errorMessage}`);
    }

    if (data?.body) {
      const parsedLambdaBody = JSON.parse(data.body);
      const responseMessage = parsedLambdaBody.message || 'Email sent successfully!';
      console.log('Email sent successfully, raw data:', data);
      console.log('Parsed Lambda body:', parsedLambdaBody);
      return responseMessage;
    } else {
      console.warn('Email sent, but no valid response data received.', data);
      throw new Error('Email sent, but no valid response data received.');
    }
  } catch (error: any) {
    console.error('Error in sendEmail utility:', error);
    throw new Error(`Error sending email: ${error.message || 'Unknown error'}`);
  }
}