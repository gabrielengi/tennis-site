import { useEffect, useState, useCallback, Fragment, useRef } from "react";
import type { Schema } from "../amplify/data/resource";
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { generateClient } from "aws-amplify/data";
import { Amplify } from 'aws-amplify';
import { Hub } from '@aws-amplify/core';
import { Subscription } from 'rxjs';
import { AuthUser, fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';

// Define an extended AuthUser type that explicitly includes attributes and session for groups
interface CustomAuthUser extends AuthUser {
  attributes?: {
    given_name?: string;
    family_name?: string;
    email?: string;
  };
  signInUserSession?: {
    getAccessToken: () => {
      payload: {
        'cognito:groups'?: string[];
      };
    };
  };
}

// Interface for a common GraphQL error structure, to avoid 'any' in error handling
interface GraphQLFormattedError {
  errorType?: string;
  message?: string;
  // Add other properties if they are consistently present and needed from GraphQL errors
}

// Interface for a GraphQL response that might contain errors
interface GraphQLResponseError {
  errors?: GraphQLFormattedError[];
}

// Define the time slots for the schedule
const timeSlots = Array.from({ length: 13 }, (_, i) => {
  const hour = 8 + i; // From 8 AM (08:00) to 8 PM (20:00)
  return `${hour.toString().padStart(2, '0')}:00`;
});

// --- Date Utility Functions ---
/**
 * Formats a Date object into a string for display or or storage.
 * @param date The Date object to format.
 * @param format 'display' for "Mon, Jul 15" or 'storage' for "YYYY-MM-DD".
 * @returns Formatted date string.
 */
const getFormattedDate = (date: Date, format: 'display' | 'storage'): string => {
  if (format === 'display') {
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  } else { // storage format 'YYYY-MM-DD'
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

/**
 * Generates an array of objects for the next 7 days, including today.
 * Each object contains the Date object, its display format, and its storage format.
 * @returns An array of date objects.
 */
const getSevenDatesFromToday = (): { date: Date, display: string, storage: string }[] => {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day

  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + i);
    dates.push({
      date: currentDate,
      display: getFormattedDate(currentDate, 'display'),
      storage: getFormattedDate(currentDate, 'storage')
    });
  }
  return dates;
};
// --- End Date Utility Functions ---

/**
 * Helper function to format the display name for a slot, prioritizing first/last name, then email, then username.
 * @param firstName User's first name.
 * @param lastName User's last name.
 * @param email User's email.
 * @param username User's username (e.g., Google ID for federated users).
 * @returns Formatted display string.
 */
const formatDisplayName = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
  username: string | null | undefined
): string => {
  if (firstName && lastName) {
    return `${firstName} ${lastName.charAt(0)}.`;
  }
  if (email) {
    return email;
  }
  return username || 'Unknown';
};

// Type guard function to filter out null/undefined Todo items and check for required properties
function isValidTodo(item: unknown): item is Schema["Todo"]["type"] { // Changed 'any' to 'unknown'
  return item !== null && item !== undefined &&
         typeof item === 'object' && // Added object check for unknown
         'id' in item && typeof (item as Schema["Todo"]["type"]).id === 'string' &&
         'dateSlot' in item && typeof (item as Schema["Todo"]["type"]).dateSlot === 'string' &&
         'timeSlot' in item && typeof (item as Schema["Todo"]["type"]).timeSlot === 'string';
}

// Type guard function to filter out null/undefined WaitlistEntry items and check for required properties
function isValidWaitlistEntry(item: unknown): item is Schema["WaitlistEntry"]["type"] { // Changed 'any' to 'unknown'
  return item !== null && item !== undefined &&
         typeof item === 'object' && // Added object check for unknown
         'id' in item && typeof (item as Schema["WaitlistEntry"]["type"]).id === 'string' &&
         'email' in item && typeof (item as Schema["WaitlistEntry"]["type"]).email === 'string' &&
         ('firstName' in item ? (typeof (item as Schema["WaitlistEntry"]["type"]).firstName === 'string' || (item as Schema["WaitlistEntry"]["type"]).firstName === null) : true) &&
         ('lastName' in item ? (typeof (item as Schema["WaitlistEntry"]["type"]).lastName === 'string' || (item as Schema["WaitlistEntry"]["type"]).lastName === null) : true) &&
         ('createdAt' in item ? (typeof (item as Schema["WaitlistEntry"]["type"]).createdAt === 'string' || (item as Schema["WaitlistEntry"]["type"]).createdAt === null) : true);
}

// Interface for booker details, including the Todo item's ID for removal
interface BookerDetails {
  id: string; // ID of the Todo item
  dateSlot: string;
  timeSlot: string;
  firstName: string;
  lastName: string;
  email: string;
}

function App() {
  const [isAmplifyConfigured, setIsAmplifyConfigured] = useState(false);
  const clientRef = useRef<ReturnType<typeof generateClient<Schema>> | null>(null);
  const [currentClientAuthMode, setCurrentClientAuthMode] = useState<'userPool' | 'apiKey' | null>(null);

  const { user, signOut, authStatus } = useAuthenticator((context) => [
    context.user,
    context.authStatus
  ]) as { user: CustomAuthUser | undefined, signOut: () => void, authStatus: string };

  // New state to hold the most reliable current user identifier (email or username)
  const [currentUserIdentifierForWaitlist, setCurrentUserIdentifierForWaitlist] = useState<string | null>(null);

  useEffect(() => {
    if (!isAmplifyConfigured) {
      return;
    }

    const desiredAuthMode = authStatus === 'authenticated' ? 'userPool' : 'apiKey';

    if (!clientRef.current || currentClientAuthMode !== desiredAuthMode) {
      clientRef.current = generateClient<Schema>({
        authMode: desiredAuthMode
      });
      setCurrentClientAuthMode(desiredAuthMode);
    }
  }, [isAmplifyConfigured, authStatus, currentClientAuthMode]);

  const client = clientRef.current;

  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalContent, setModalContent] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  const [waitlistEntries, setWaitlistEntries] = useState<Array<Schema["WaitlistEntry"]["type"]>>([]);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);

  const [isDataInitialized, setIsDataInitialized] = useState(false);
  const initialLoadPerformed = useRef(false);

  const [showBookerDetailsModal, setShowBookerDetailsModal] = useState(false);
  const [bookerDetails, setBookerDetails] = useState<BookerDetails | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  // State to track if the current user is in the waitlist, now dependent on currentUserIdentifierForWaitlist
  const [isUserInWaitlist, setIsUserInWaitlist] = useState(false);


  const sevenDates = getSevenDatesFromToday();

  const hideModal = useCallback(() => {
    const timer = setTimeout(() => {
      setModalContent(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const removeListener = Hub.listen('core', (data) => {
      if (data.payload.event === 'configured') {
        setIsAmplifyConfigured(true);
      }
    });

    if (Object.keys(Amplify.getConfig()).length > 0) {
      setIsAmplifyConfigured(true);
    }

    return () => removeListener();
  }, []);

  // Effect to reliably get the current user's email or username for waitlist identification
  useEffect(() => {
    const getAndSetUserIdentifier = async () => {
      if (authStatus === 'authenticated' && user) {
        try {
          const latestAttrs = await fetchUserAttributes();
          // Prioritize email, fallback to username (Google ID)
          setCurrentUserIdentifierForWaitlist(latestAttrs.email || user.username || null);
        } catch (error) {
          console.error("Error fetching user attributes for waitlist identifier:", error);
          // Fallback to username if attributes can't be fetched
          setCurrentUserIdentifierForWaitlist(user.username || null);
        }
      } else {
        setCurrentUserIdentifierForWaitlist(null);
      }
    };
    getAndSetUserIdentifier();
  }, [authStatus, user]); // Re-run when auth status or user object changes

  // Effect 1: For initial data loading and cleanup (runs once on component mount, after Amplify is configured)
  useEffect(() => {
    const loadInitialData = async () => {
      if (initialLoadPerformed.current) {
        setIsLoading(false);
        return;
      }

      if (!isAmplifyConfigured || authStatus === 'configuring' || !client) {
        return;
      }

      setIsLoading(true);

      try {
        let allExistingTodos: Schema["Todo"]["type"][] = [];
        let nextToken: string | undefined | null = null;
        do {
          const { data: currentTodosPage = [], nextToken: newNextToken_typed }: { data: Schema["Todo"]["type"][], nextToken?: string | null } = await client.models.Todo.list({
            limit: 1000,
            nextToken: nextToken || undefined,
          });
          allExistingTodos = allExistingTodos.concat(currentTodosPage.filter(isValidTodo));
          nextToken = newNextToken_typed;
        } while (nextToken);

        setTodos(allExistingTodos);

        const expectedSlotKeys = new Set<string>();
        for (const dateObj of sevenDates) {
          for (const time of timeSlots) {
            expectedSlotKeys.add(`${dateObj.storage}-${time}`);
          }
        }

        const validExistingSlots = new Map<string, Schema["Todo"]["type"]>();
        const idsToDelete = new Set<string>();

        allExistingTodos.forEach(todo => {
          const key = `${todo.dateSlot}-${todo.timeSlot}`;
          if (expectedSlotKeys.has(key)) {
            if (validExistingSlots.has(key)) {
              idsToDelete.add(todo.id);
            } else {
              validExistingSlots.set(key, todo);
            }
          } else {
            idsToDelete.add(todo.id);
          }
        });

        if (idsToDelete.size > 0) {
          await Promise.allSettled(Array.from(idsToDelete).map(id => client.models.Todo.delete({ id })));
        }

        const newSlotsToCreate = [];
        for (const dateObj of sevenDates) {
          for (const time of timeSlots) {
            const key = `${dateObj.storage}-${time}`;
            if (!validExistingSlots.has(key)) {
              newSlotsToCreate.push({
                dateSlot: dateObj.storage,
                timeSlot: time,
                bookedByUsername: null,
                bookedByFirstName: null,
                bookedByLastName: null,
                bookedByEmail: null,
              });
            }
          }
        }

        if (newSlotsToCreate.length > 0) {
          await Promise.allSettled(newSlotsToCreate.map(slot => client.models.Todo.create(slot)));
        }

        let finalTodos: Schema["Todo"]["type"][] = [];
        let finalNextToken: string | undefined | null = null;
        do {
          const { data: page = [], nextToken: newNextToken_final }: { data: Schema["Todo"]["type"][], nextToken?: string | null } = await client.models.Todo.list({
            limit: 1000,
            nextToken: finalNextToken || undefined,
          });
          finalTodos = finalTodos.concat(page.filter(isValidTodo));
          finalNextToken = newNextToken_final;
        } while (finalNextToken);

        setTodos(finalTodos);

        initialLoadPerformed.current = true;
        setIsDataInitialized(true);
        setIsLoading(false);
      } catch (error) {
        console.error("Error during initial Todo data setup:", error);
        setModalContent("Failed to initialize schedule. Please try again.");
        hideModal();
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [isAmplifyConfigured, authStatus, client, sevenDates, timeSlots, hideModal]);

  // Effect to update isAdmin state when user object changes
  useEffect(() => {
    const checkAdminStatus = async () => {
      let calculatedIsAdmin = false;
      if (user?.username === 'google_116267331380489634932') {
        calculatedIsAdmin = true;
      } else if (authStatus === 'authenticated') {
        try {
          const currentUser = await getCurrentUser();
          const groups = (currentUser as CustomAuthUser).signInUserSession?.getAccessToken()?.payload['cognito:groups'];
          calculatedIsAdmin = groups?.includes('Admins') || false;
        } catch (error) {
          console.error("Error fetching current authenticated user for admin check:", error);
          calculatedIsAdmin = false;
        }
      }
      setIsAdmin(calculatedIsAdmin);
    };

    checkAdminStatus();
  }, [user, authStatus]);

  // Effect to update isUserInWaitlist state when user or waitlistEntries change
  // This is crucial for the button to toggle correctly, using the consistent identifier
  useEffect(() => {
    if (currentUserIdentifierForWaitlist && waitlistEntries.length > 0) {
      setIsUserInWaitlist(waitlistEntries.some(entry => entry.email === currentUserIdentifierForWaitlist));
    } else {
      setIsUserInWaitlist(false);
    }
  }, [currentUserIdentifierForWaitlist, waitlistEntries]); // Depend on the new consistent identifier

  // Effect 2: For setting up real-time subscriptions
  useEffect(() => {
    let todoSub: Subscription | undefined;
    let waitlistSub: Subscription | undefined;

    if (isDataInitialized && client) {
      todoSub = client.models.Todo.observeQuery().subscribe({
        next: ({ items }) => {
          const filteredItems = items.filter(isValidTodo);
          setTodos(filteredItems);
        },
        error: (error) => {
          console.error("Error observing todos in real-time:", error);
        }
      });

      waitlistSub = client.models.WaitlistEntry.observeQuery().subscribe({
        next: ({ items }) => {
          const filteredItems = items.filter(isValidWaitlistEntry);
          setWaitlistEntries(filteredItems);
        },
        error: (error) => {
          console.error("Error observing waitlist entries in real-time:", error);
        }
      });
    } 
    // else {
    // }

    return () => {
      if (todoSub) {
        todoSub.unsubscribe();
      }
      if (waitlistSub) {
        waitlistSub.unsubscribe();
      }
    };
  }, [isDataInitialized, client, currentClientAuthMode]);

  useEffect(() => {
    if (authStatus === 'authenticated' && showAuth) {
      setShowAuth(false);
      setModalContent("Successfully signed in!");
      hideModal();
    }
  }, [authStatus, showAuth, hideModal]);


  // Function to handle removing a booking as admin
  const handleRemoveBookingAsAdmin = async (todoId: string) => {
    if (!isAdmin) {
      setModalContent("Unauthorized: Only the admin can remove other users' bookings.");
      hideModal();
      return;
    }
    if (!client) {
      console.error("Amplify client is not initialized for booking operation.");
      setModalContent("Application not ready. Please try again in a moment.");
      hideModal();
      return;
    }

    try {
      const updatedTodoResult = await client.models.Todo.update({ // Capture the result object
        id: todoId,
        bookedByUsername: null,
        bookedByFirstName: null,
        bookedByLastName: null,
        bookedByEmail: null,
      }, { authMode: 'userPool' });
      // FIX: Access .data property from the result for TypeScript correctness
      if (updatedTodoResult.data) {
        // const [year, month, day] = updatedTodoResult.data.dateSlot.split('-').map(Number);
        // const localDateForAlert = new Date(year, month - 1, day);
        setModalContent("Booking successfully removed by admin.");
      } else {
        setModalContent("Failed to remove booking: No data returned.");
      }
      setShowBookerDetailsModal(false);
      hideModal();
    } catch (error: unknown) { // Changed 'any' to 'unknown'
      console.error("Error removing booking as admin:", error);
      if (
        typeof error === 'object' &&
        error !== null &&
        'errors' in error &&
        Array.isArray((error as GraphQLResponseError).errors) &&
        (error as GraphQLResponseError).errors!.some(e => e.errorType === 'Unauthorized')
      ) {
        setModalContent("Permission denied: You do not have authorization to remove this booking. Please ensure you are signed in correctly.");
      } else {
        setModalContent("Failed to remove booking. Please try again.");
      }
      hideModal();
    }
  };

  // Function to handle clicking on a schedule slot
  const handleSlotClick = async (dateSlot: string, timeSlot: string) => {
    if (authStatus !== 'authenticated' || !user) {
      setShowAuth(true);
      return;
    }

    let latestUserAttributes;
    try {
      latestUserAttributes = await fetchUserAttributes();
    } catch (error) {
      console.error("Error fetching latest user attributes:", error);
      setModalContent("Failed to retrieve user details. Please try again.");
      hideModal();
      return;
    }

    const currentUserLoginId = user.username;
    const currentUserFirstName = latestUserAttributes.given_name || null;
    const currentUserLastName = latestUserAttributes.family_name || null;
    const currentUserEmail = latestUserAttributes.email || null;


    if (!client) {
      console.error("Amplify client is not initialized for booking operation.");
      setModalContent("Application not ready. Please try again in a moment.");
      hideModal();
      return;
    }

    const targetTodo = todos.find(
      (todo: Schema["Todo"]["type"]) =>
        todo.dateSlot === dateSlot && todo.timeSlot === timeSlot
    );

    try {
      if (targetTodo) {
        if (targetTodo.bookedByUsername === currentUserLoginId) {
          await client.models.Todo.update({
            id: targetTodo.id,
            bookedByUsername: null,
            bookedByFirstName: null,
            bookedByLastName: null,
            bookedByEmail: null,
          }, { authMode: 'userPool' });
          const [year, month, day] = dateSlot.split('-').map(Number);
          const localDateForAlert = new Date(year, month - 1, day);
          setModalContent(`Slot ${getFormattedDate(localDateForAlert, 'display')} ${timeSlot} unbooked.`);
          hideModal();
        }
        else if (targetTodo.bookedByUsername !== null) {
          const [year, month, day] = dateSlot.split('-').map(Number);
          const localDateForAlert = new Date(year, month - 1, day);

          if (isAdmin) {
            setBookerDetails({
              id: targetTodo.id,
              dateSlot: targetTodo.dateSlot,
              timeSlot: targetTodo.timeSlot,
              firstName: targetTodo.bookedByFirstName || 'N/A',
              lastName: targetTodo.bookedByLastName || 'N/A', // FIX: Corrected property name
              email: targetTodo.bookedByEmail || 'N/A',       // FIX: Corrected property name
            });
            setShowBookerDetailsModal(true);
          } else {
            setModalContent(`Slot ${getFormattedDate(localDateForAlert, 'display')} ${timeSlot} is already booked by ${formatDisplayName(targetTodo.bookedByFirstName, targetTodo.bookedByLastName, targetTodo.bookedByEmail, targetTodo.bookedByUsername)}.`);
            hideModal();
          }
        }
        else {
            await client.models.Todo.update({
              id: targetTodo.id,
              bookedByUsername: currentUserLoginId,
              bookedByFirstName: currentUserFirstName,
              bookedByLastName: currentUserLastName,
              bookedByEmail: currentUserEmail,
            }, { authMode: 'userPool' });
            const [year, month, day] = dateSlot.split('-').map(Number);
            const localDateForAlert = new Date(year, month - 1, day);
            setModalContent(`Slot ${getFormattedDate(localDateForAlert, 'display')} ${timeSlot} booked.`);
            hideModal();
        }
      } else {
        // const newTodo = await client.models.Todo.create({
        //   dateSlot: dateSlot,
        //   timeSlot: timeSlot,
        //   bookedByUsername: currentUserLoginId,
        //   bookedByFirstName: currentUserFirstName,
        //   bookedByLastName: currentUserLastName,
        //   bookedByEmail: currentUserEmail,
        // }, { authMode: 'userPool' });
        const [year, month, day] = dateSlot.split('-').map(Number);
        const localDateForAlert = new Date(year, month - 1, day);
        setModalContent(`New slot ${getFormattedDate(localDateForAlert, 'display')} ${timeSlot} created and booked!`);
        hideModal();
      }
    } catch (error: unknown) { // Changed 'any' to 'unknown'
      console.error("Error booking/unbooking slot:", error);
      if (
        typeof error === 'object' &&
        error !== null &&
        'errors' in error &&
        Array.isArray((error as GraphQLResponseError).errors) &&
        (error as GraphQLResponseError).errors!.some(e => e.errorType === 'Unauthorized')
      ) {
        setModalContent("Permission denied: You do not have authorization to book this slot. Please ensure you are signed in correctly.");
      } else {
        setModalContent("Failed to update slot. Please try again.");
      }
      hideModal();
    }
  };

  const handleWaitlistToggle = async () => {
    if (authStatus !== 'authenticated' || !user) {
      setModalContent("Please sign in to manage your waitlist status.");
      setShowAuth(true);
      hideModal();
      return;
    }

    if (!client) {
      console.error("Amplify client is not initialized for waitlist operation.");
      setModalContent("Application not ready. Please try again in a moment.");
      hideModal();
      return;
    }

    // Fetch latest user attributes to ensure they are up-to-date for waitlist signup
    let latestUserAttributes;
    try {
      latestUserAttributes = await fetchUserAttributes();
    } catch (error) {
      console.error("Error fetching latest user attributes for waitlist:", error);
      setModalContent("Failed to retrieve user details for waitlist. Please try again.");
      hideModal();
      return;
    }

    // Use the consistent identifier derived from fetchUserAttributes
    const emailToStoreAndCheck = latestUserAttributes.email || user.username;
    const currentUserFirstName = latestUserAttributes.given_name || null;
    const currentUserLastName = latestUserAttributes.family_name || null;

    if (!emailToStoreAndCheck) {
      setModalContent("Could not retrieve your user identifier. Please ensure your profile has an email or username.");
      hideModal();
      return;
    }

    try {
      if (isUserInWaitlist) {
        // Remove from waitlist
        const entryToRemove = waitlistEntries.find(entry => entry.email === emailToStoreAndCheck);
        if (entryToRemove) {
          await client.models.WaitlistEntry.delete({ id: entryToRemove.id }, { authMode: 'userPool' });
          setModalContent("You have been removed from the group lesson waitlist.");
        } else {
          // This case should ideally not happen if isUserInWaitlist is true and data is consistent
          setModalContent("Could not find your waitlist entry to remove. Please try refreshing.");
        }
      } else {
        // Add to waitlist
        await client.models.WaitlistEntry.create({
          email: emailToStoreAndCheck, // Use the consistent identifier
          firstName: currentUserFirstName,
          lastName: currentUserLastName,
          createdAt: new Date().toISOString(), // Changed to toISOString() to match resource.ts string type
        }, { authMode: 'userPool' });
        setModalContent("You have been added to the group lesson waitlist! We'll notify you when spots become available.");
      }
    } catch (error: unknown) { // Changed 'any' to 'unknown'
      console.error("Error managing waitlist:", error);
      if (
        typeof error === 'object' &&
        error !== null &&
        'errors' in error &&
        Array.isArray((error as GraphQLResponseError).errors) &&
        (error as GraphQLResponseError).errors!.some(e => e.errorType === 'Unauthorized')
      ) {
        setModalContent("Permission denied: You do not have authorization to manage your waitlist status. Please ensure you are signed in correctly.");
      } else {
        setModalContent("Failed to update waitlist status. Please try again.");
      }
    }
    hideModal();
  };


  const handleViewWaitlist = () => {
    setShowWaitlistModal(true);
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
        <p style={{ fontSize: '1.125rem', color: '#4b5563' }}>Loading schedule...</p>
      </div>
    );
  }

  // const displayNameForHeader = formatDisplayName(
  //   user?.attributes?.given_name,
  //   user?.attributes?.family_name,
  //   user?.attributes?.email,
  //   user?.username
  // );

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '1rem', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width: '100%',
        maxWidth: '64rem',
        backgroundColor: '#ffffff',
        borderRadius: '0.5rem',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        padding: '1.5rem',
        flexShrink: 0,
        maxHeight: 'calc(100vh - 2rem)',
        overflowY: 'auto',
        position: 'relative',
      }}>

        <div style={{
          position: 'absolute',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 10,
        }}>
          {user ? (
            <button
              onClick={signOut}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontWeight: '600',
                borderRadius: '0.375rem',
                boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
                transition: 'background-color 0.2s ease-in-out',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#b91c1c')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
            >
              Sign out
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: '600',
                borderRadius: '0.375rem',
                boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
                transition: 'background-color 0.2s ease-in-out',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
            >
              Sign In / Sign Up
            </button>
          )}
        </div>

        {/* Header section with title - Adjusted for centering */}
        <div style={{
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center', // Center items horizontally
          justifyContent: 'center', // Center content if it were a row
          paddingBottom: '0.5rem',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1f2937', textAlign: 'center' }}>
            Grand River Tennis Lessons
          </h1>
        </div>

        {/* Tennis Coaching Blurb - Updated content and alignment */}
        <div style={{ marginBottom: '1.5rem', textAlign: 'left', color: '#374151' }}> {/* Changed textAlign to 'left' */}
          <p style={{ fontSize: '1rem', lineHeight: '1.5', marginBottom: '1rem', marginLeft: '1rem', marginRight: '1rem' }}> {/* Added horizontal margins for indent */}
            Hello! My name is Gabriel, and I'm looking to share my love for tennis and provide affordable lessons to people of all ages and skill levels.
          </p>
          <p style={{ fontSize: '1rem', lineHeight: '1.5', marginBottom: '1rem', marginLeft: '1rem', marginRight: '1rem' }}> {/* Added horizontal margins for indent */}
            I have experience coaching private lessons, assistant coaching for a tennis camp, and being a hitting partner for top junior OTA players.
          </p>
          <p style={{ fontSize: '1rem', lineHeight: '1.5', marginBottom: '1rem', marginLeft: '1rem', marginRight: '1rem' }}> {/* Added horizontal margins for indent */}
            Lessons are held at the public courts at WCI so we are limited to a couple cans of balls. There's also a small chance the courts will be preoccupied, in which case we'll work on technique, volleys, and hitting against a wall until a court becomes available.
          </p>
          <p style={{ fontSize: '1rem', lineHeight: '1.5', marginBottom: '1rem', marginLeft: '1rem', marginRight: '1rem' }}> {/* Added horizontal margins for indent */}
            Lessons are **$30 for a 1-hour session**, with your **first lesson only $10!** You can also come with friends and split the cost. Click on an available space in the calendar to book a lesson, and I'll personally send you an email to confirm. Currently, I'm only accepting **cash payments**.
          </p>
          <p style={{ fontSize: '1rem', lineHeight: '1.5', marginLeft: '1rem', marginRight: '1rem' }}> {/* Added horizontal margins for indent */}
            If you want to cancel a booking, simply click your slot on the calendar. Please try to avoid canceling within 3 hours of the lesson, but if you forget, there are no fees or worries.
          </p>
        </div>

        {/* Group Lesson Description - Updated content and alignment */}
        <div style={{ marginBottom: '1rem', textAlign: 'left', color: '#374151' }}> {/* Changed textAlign to 'left' */}
          <p style={{ fontSize: '1rem', lineHeight: '1.5', marginLeft: '1rem', marginRight: '1rem' }}> {/* Added horizontal margins for indent */}
            Interested in group sessions? I'm looking to organize longer group sessions with a mix of tennis drills and singles/doubles matches. Sign up for the waitlist, and once I have enough interest, I'll email everyone to work something out.
          </p>
        </div>

        {/* Email Contact Line - Added here and aligned left */}
        <div style={{ marginBottom: '1.5rem', textAlign: 'left', color: '#374151', fontSize: '1rem', lineHeight: '1.5', marginLeft: '1rem', marginRight: '1rem' }}> {/* Changed textAlign to 'left' and added horizontal margins */}
            <p>Feel free to email <a href="mailto:gabriel.jsh@gmail.com" style={{ color: '#2563eb', textDecoration: 'underline' }}>gabriel.jsh@gmail.com</a> if you have any questions!</p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <button
            onClick={handleWaitlistToggle}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: isUserInWaitlist ? '#047857' : '#10b981',
              color: '#ffffff',
              fontWeight: '600',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              transition: 'background-color 0.2s ease-in-out',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = isUserInWaitlist ? '#065f46' : '#059669')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = isUserInWaitlist ? '#047857' : '#10b981')}
          >
            {isUserInWaitlist ? "In Waitlist for Group Lessons (Click to Remove)" : "Sign up for Group Lesson Waitlist"}
          </button>

          {isAdmin && (
            <button
              onClick={handleViewWaitlist}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                fontWeight: '600',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                transition: 'background-color 0.2s ease-in-out',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
            >
              View Waitlist
            </button>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `80px repeat(7, 1fr)`,
            gap: '0.25rem',
            fontSize: '0.875rem',
          }}>
            <div style={{ padding: '0.5rem', borderBottom: '1px solid #d1d5db', borderRight: '1px solid #d1d5db', backgroundColor: '#f9fafb', fontWeight: '600', color: '#374151', borderRadius: '0.5rem 0 0 0', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></div>
            {sevenDates.map((dateObj) => (
              <div
                key={dateObj.storage}
                style={{ padding: '0.5rem', borderBottom: '1px solid #d1d5db', backgroundColor: '#f9fafb', fontWeight: '600', textAlign: 'center', color: '#374151', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {dateObj.display}
              </div>
            ))}

            {timeSlots.map((time) => (
              <Fragment key={`row-${time}`}>
                <div
                  key={`time-${time}`}
                  style={{ padding: '0.5rem', borderRight: '1px solid #d1d5db', backgroundColor: '#f9fafb', fontWeight: '600', color: '#374151', textAlign: 'right', paddingRight: '1rem', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
                >
                  {time}
                </div>
                {sevenDates.map((dateObj) => {
                  const todoForSlot = todos.find(
                    (todo: Schema["Todo"]["type"]) =>
                      todo.dateSlot === dateObj.storage && todo.timeSlot === time
                  );

                  const isBooked = !!todoForSlot?.bookedByUsername;
                  const isBookedByCurrentUser = user?.username && todoForSlot?.bookedByUsername === user.username;

                  let slotCursor = 'pointer';
                  let slotClickHandler: (() => void) | undefined = () => handleSlotClick(dateObj.storage, time);

                  let slotBackgroundColor: string;
                  let slotBorderColor: string;
                  let slotTextColor: string;


                  if (isBookedByCurrentUser) {
                    slotBackgroundColor = '#dcfce7';
                    slotBorderColor = '#86efad';
                    slotTextColor = '#166534';
                  } else if (isBooked) {
                    if (isAdmin) {
                        slotBackgroundColor = '#f5f5dc';
                        slotBorderColor = '#d4c0a1';
                        slotTextColor = '#5c4033';
                        slotCursor = 'pointer';
                    } else {
                        slotBackgroundColor = '#e0e0e0';
                        slotBorderColor = '#c0c0c0';
                        slotTextColor = '#606060';
                        slotCursor = 'default';
                        slotClickHandler = undefined;
                    }
                  } else {
                    slotBackgroundColor = '#dbeafe';
                    slotBorderColor = '#93c5fd';
                    slotTextColor = '#1e40af';
                  }


                  return (
                    <div
                      key={`${dateObj.storage}-${time}`}
                      style={{
                        padding: '0.5rem',
                        border: `1px solid ${slotBorderColor}`,
                        cursor: slotCursor,
                        borderRadius: '0.375rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        transition: 'background-color 0.2s ease-in-out',
                        height: '60px',
                        backgroundColor: slotBackgroundColor,
                        color: slotTextColor,
                        fontWeight: isBooked ? '500' : 'normal',
                      }}
                      onClick={slotClickHandler}
                      aria-label={isBooked && !isBookedByCurrentUser && !isAdmin ? "This slot is booked and unavailable" : undefined}
                    >
                      {isBookedByCurrentUser ? (
                        <span style={{ fontSize: '0.75rem', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          You
                        </span>
                      ) : isBooked && todoForSlot ? (
                        <span style={{ fontSize: '0.75rem', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {isAdmin ? (
                            formatDisplayName(todoForSlot.bookedByFirstName, todoForSlot.bookedByLastName, todoForSlot.bookedByEmail, todoForSlot.bookedByUsername)
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '1em', height: '1em', verticalAlign: 'middle', marginRight: '0.25em' }}>
                              <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                            </svg>
                          )}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem' }}>&nbsp;</span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      {modalContent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 999,
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            padding: '2rem',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 20px rgba(0, 0, 0, 0.2)',
            maxWidth: '90%',
            maxHeight: '90%',
            overflowY: 'auto',
            position: 'relative',
            textAlign: 'center',
            color: '#1f2937',
            fontSize: '1.125rem',
          }}>
            <p style={{ margin: '0' }}>{modalContent}</p>
          </div>
        </div>
      )}

      {showWaitlistModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            padding: '2rem',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 20px rgba(0, 0, 0, 0.2)',
            maxWidth: '90%',
            maxHeight: '90%',
            overflowY: 'auto',
            position: 'relative',
            textAlign: 'center',
            color: '#1f2937',
            fontSize: '1.125rem',
          }}>
            <button
              onClick={() => setShowWaitlistModal(false)}
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#6b7280',
                padding: '0.25rem',
                lineHeight: '1',
                borderRadius: '0.25rem',
                transition: 'color 0.2s ease-in-out',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#374151')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              &times;
            </button>
            <h2 style={{ marginTop: '0', marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>Group Lesson Waitlist</h2>
            {waitlistEntries.length > 0 ? (
              <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                {waitlistEntries.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()).map((entry) => (
                  <li key={entry.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                    <strong>Name:</strong> {entry.firstName === null ? 'null' : entry.firstName || 'N/A'} {entry.lastName === null ? 'null' : entry.lastName || 'N/A'} <br/>
                    <strong>Email:</strong> {entry.email} (Signed up: {new Date(entry.createdAt!).toLocaleString()})
                  </li>
                ))}
              </ul>
            ) : (
              <p>No users currently on the waitlist.</p>
            )}
          </div>
        </div>
      )}

      {showAuth && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1001,
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            position: 'relative',
            maxWidth: '90%',
            maxHeight: '90%',
            overflowY: 'auto',
          }}>
            <Authenticator
              initialState={authStatus === 'authenticated' ? 'signIn' : 'signIn'}
              hideSignUp={false}
            >
              {() => (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <p>Authentication flow completed. You can now close this window.</p>
                  <button
                    onClick={() => setShowAuth(false)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontWeight: '600',
                      borderRadius: '0.375rem',
                      border: 'none',
                      cursor: 'pointer',
                      marginTop: '1rem',
                    }}
                  >
                    Close
                  </button>
                </div>
              )}
            </Authenticator>
          </div>
          <button
            onClick={() => setShowAuth(false)}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '2rem',
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {showBookerDetailsModal && bookerDetails && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1002,
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            padding: '2rem',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 20px rgba(0, 0, 0, 0.2)',
            maxWidth: '400px',
            textAlign: 'center',
            color: '#1f2937',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowBookerDetailsModal(false)}
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#6b7280',
                padding: '0.25rem',
                lineHeight: '1',
                borderRadius: '0.25rem',
                transition: 'color 0.2s ease-in-out',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#374151')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              &times;
            </button>
            <h2 style={{ marginTop: '0', marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>Booker Details</h2>
            <p style={{ margin: '0.5rem 0' }}><strong>Date:</strong> {getFormattedDate(new Date(bookerDetails.dateSlot), 'display')}</p>
            <p style={{ margin: '0.5rem 0' }}><strong>Time:</strong> {bookerDetails.timeSlot}</p>
            <p style={{ margin: '0.5rem 0' }}><strong>First Name:</strong> {bookerDetails.firstName}</p>
            <p style={{ margin: '0.5rem 0' }}><strong>Last Name:</strong> {bookerDetails.lastName}</p>
            <p style={{ margin: '0.5rem 0' }}><strong>Email:</strong> {bookerDetails.email}</p>
            <button
              onClick={() => handleRemoveBookingAsAdmin(bookerDetails.id)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontWeight: '600',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
                transition: 'background-color 0.2s ease-in-out',
                border: 'none',
                cursor: 'pointer',
                marginTop: '1.5rem',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#b91c1c')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
            >
              Remove Booking
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
