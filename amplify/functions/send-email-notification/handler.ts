// amplify/functions/send-email-notification/handler.ts

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// UPDATE THE INPUT TYPE
export type SendEmailInput = {
  arguments: { // The arguments are nested under 'arguments'
    subject: string;
    body: string;
  };
  // Add other properties if you plan to use them from the AppSync event, e.g., identity, request
  identity?: any;
  source?: any;
  request?: any;
};

export type SendEmailOutput = {
  statusCode: number;
  body: string;
};

export const handler = async (event: SendEmailInput): Promise<SendEmailOutput> => {
  console.log('Received request to send email:', event);

  // CORRECT THE DESTRUCTURING
  const { subject, body } = event.arguments; // <-- FIX IS HERE!

  const SOURCE_EMAIL = process.env.SENDER_EMAIL;
  const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL;

  if (!SOURCE_EMAIL || !RECIPIENT_EMAIL) {
      console.error("SENDER_EMAIL or RECIPIENT_EMAIL environment variables are not set for the Lambda.");
      throw new Error("Email configuration missing. Cannot send email.");
  }

  const sesClient = new SESClient({ region: process.env.AWS_REGION || "us-east-2" });

  const sendEmailCommand = new SendEmailCommand({
    Source: SOURCE_EMAIL,
    Destination: {
      ToAddresses: [RECIPIENT_EMAIL],
    },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: body } },
    },
  });

  try {
    await sesClient.send(sendEmailCommand);
    console.log('Email sent successfully!');
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent successfully!' }),
    };
  } catch (error: any) {
    console.error('Failed to send email:', { error: error.message, stack: error.stack });
    throw new Error(`Failed to send email: ${error.message}`);
  }
};