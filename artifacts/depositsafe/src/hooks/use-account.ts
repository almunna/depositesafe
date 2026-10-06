import { useClerk, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function useAccount() {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const signOut = async () => {
    // Drops the previous user's cached account data before the session ends.
    queryClient.clear();
    await clerk.signOut({ redirectUrl: `${base}/` });
  };
  return { isSignedIn: isLoaded && Boolean(isSignedIn), email: user?.primaryEmailAddress?.emailAddress, signOut };
}
