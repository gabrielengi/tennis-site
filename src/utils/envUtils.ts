// src/utils/envUtils.ts

/**
 * Determines the current Amplify environment name based on the application's hostname.
 * This is a common approach for client-side applications deployed with Amplify Hosting
 * where the environment name is part of the subdomain (e.g., 'main.amplifyapp.com', 'prod.amplifyapp.com').
 *
 * @returns The environment name as a string (e.g., 'sandbox', 'main', 'prod', or a specific branch name like 'dev', 'feature-x').
 */
export function getAmplifyEnvironmentName(): string {
  const hostname = window.location.hostname;

  // 1. Check for local development/sandbox environment
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // You can customize this to 'development' if you prefer, but 'sandbox'
    // often aligns well with local Amplify deployments.
    return 'sandbox';
  }

  // 2. Check for common deployed Amplify Hosting patterns
  // Examples: 'main.dXXXX.amplifyapp.com', 'prod.dXXXX.amplifyapp.com', 'your-branch.dXXXX.amplifyapp.com'
  const parts = hostname.split('.');

  // This condition looks for the pattern: [branch-name].[hash].amplifyapp.com
  // It checks if there are at least 3 parts (branch.hash.amplifyapp.com)
  // and if the last two parts form the Amplify App domain.
  if (parts.length >= 3 && parts[parts.length - 2]?.endsWith('amplifyapp') && parts[parts.length - 1] === 'com') {
    // The first part of the hostname is typically the branch name or environment name
    return parts[0]; // Returns 'main', 'prod', 'dev', 'feature-branch-name', etc.
  }

  // Fallback if none of the known patterns match
  return 'unknown';
}