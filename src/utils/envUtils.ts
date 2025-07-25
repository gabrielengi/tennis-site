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
    // Returns 'sandbox' for local development
    return 'sandbox';
  }

  // 2. Check for standard Amplify Hosting domains
  // This regex matches patterns like:
  // - branch-name.dXXXXXXXXXXXXX.amplifyapp.com (e.g., 'main.d123abc.amplifyapp.com')
  // - dXXXXXXXXXXXXX.amplifyapp.com (the root domain for the Amplify app, often mapped to 'main' or 'prod')
  const amplifyAppDomainMatch = hostname.match(/^(?:([^.]+)\.)?(d[a-z0-9]+)\.amplifyapp\.com$/);

  if (amplifyAppDomainMatch) {
    // amplifyAppDomainMatch[1] captures the branch name (e.g., 'main', 'dev', 'prod') if it exists.
    // If the hostname is just dXXXXXXXXXXXXX.amplifyapp.com, amplifyAppDomainMatch[1] will be undefined.
    const branchName = amplifyAppDomainMatch[1];

    if (branchName) {
      // If a branch name is explicitly present (e.g., 'main', 'dev', 'feature-x'), return it.
      return branchName;
    } else {
      // If no explicit branch name is found (e.g., dXXXXXXXXXXXXX.amplifyapp.com),
      // this typically corresponds to the default branch in Amplify Hosting (often 'main' or 'prod').
      // You might need to adjust 'main' to 'prod' here if your root app domain is specifically your production environment.
      return 'main'; // Default to 'main' if no branch prefix is found.
    }
  }

  // 3. Add specific logic for custom domains.
  // Check for your custom production domain 'grandrivertennis.ca' or subdomains like 'prod.grandrivertennis.ca'
  if (hostname === 'grandrivertennis.ca' || hostname.startsWith('prod.grandrivertennis.ca')) {
    return 'prod';
  }
  // Example for other custom domains or environments:
  // if (hostname === 'dev.yourtennislessons.com') {
  //   return 'dev';
  // }

  // Fallback if none of the known patterns match
  return 'unknown';
}
