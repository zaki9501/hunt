/**
 * Auth Store using Zustand
 */

import { create } from 'zustand';
import { User } from '../lib/types';
import { api } from '../lib/api';

const DEV_USER: User = {
  id: 'dev-user-id',
  email: 'dev@localhost',
  name: 'Dev User',
  createdAt: new Date().toISOString(),
  plan: 'free',
};

const IS_DEV = process.env.NODE_ENV === 'development';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;

    // In development, skip login and use dev user
    if (IS_DEV) {
      set({ user: DEV_USER, initialized: true, loading: false });
      return;
    }
    
    set({ loading: true });
    
    try {
      api.loadToken();
      const user = await api.getMe();
      set({ user, initialized: true, loading: false });
    } catch (error) {
      // Not authenticated
      set({ user: null, initialized: true, loading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ loading: true });
    
    try {
      const { user } = await api.login({ email, password });
      set({ user, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (email: string, password: string, name?: string) => {
    set({ loading: true });
    
    try {
      const { user } = await api.register({ email, password, name });
      set({ user, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: () => {
    api.logout();
    // In development, stay as dev user (no real logout)
    if (!IS_DEV) {
      set({ user: null });
    }
  },

  setUser: (user: User | null) => {
    set({ user });
  },
}));
