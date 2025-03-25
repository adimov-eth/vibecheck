import { useEffect } from "react";
import useStore from "../state/index";

export const useUserProfile = () => {
  const { userProfile, getUserProfile, authLoading, error } = useStore();

  useEffect(() => {
    if (!userProfile && !authLoading) {
      getUserProfile().catch(() => {}); // Handle error in component if needed
    }
  }, [userProfile, authLoading, getUserProfile]);

  return { user: userProfile, isLoading: authLoading, isError: !!error };
}; 