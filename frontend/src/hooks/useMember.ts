import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'chorequest_current_member';

export interface StoredMember {
  id: number;
  name: string;
  avatar_color: string;
  is_parent?: boolean;
}

export function useMember() {
  const [currentMember, setCurrentMember] = useState<StoredMember | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (currentMember) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMember));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [currentMember]);

  const selectMember = useCallback((member: StoredMember | null) => {
    setCurrentMember(member);
  }, []);

  return { currentMember, selectMember };
}
