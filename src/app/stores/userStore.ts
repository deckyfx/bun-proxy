import { create } from 'zustand';
import { api } from '@app/utils/fetchUtils';

export interface User {
  id: number;
  email: string;
  username: string;
  name: string;
  last_login: Date | null;
  status: 'Active' | 'Inactive';
}

export interface CreateUserData {
  email: string;
  username: string;
  password: string;
  name: string;
}

export interface UpdateUserData {
  id: number;
  email?: string;
  username?: string;
  password?: string;
  name?: string;
}

interface UserStore {
  users: User[];
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchUsers: () => Promise<void>;
  createUser: (userData: CreateUserData) => Promise<User>;
  updateUser: (userData: UpdateUserData) => Promise<User>;
  deleteUser: (userId: number) => Promise<void>;
  clearError: () => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  users: [],
  loading: false,
  error: null,

  fetchUsers: async () => {
    set({ loading: true, error: null });
    try {
      const users = await api.get('/api/user/list');
      set({ 
        users: users.map((user: any) => ({
          ...user,
          last_login: user.last_login ? new Date(user.last_login) : null,
        })),
        loading: false 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch users',
        loading: false 
      });
    }
  },

  createUser: async (userData: CreateUserData) => {
    set({ error: null });
    try {
      const newUser = await api.post('/api/user/create', userData, {
        showSuccess: true,
        successMessage: 'User created successfully'
      });
      
      const userWithDate = {
        ...newUser,
        last_login: newUser.last_login ? new Date(newUser.last_login) : null,
      };
      
      set(state => ({ 
        users: [...state.users, userWithDate]
      }));
      
      return userWithDate;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create user';
      set({ error: errorMessage });
      throw error;
    }
  },

  updateUser: async (userData: UpdateUserData) => {
    set({ error: null });
    try {
      const updatedUser = await api.put('/api/user/update', userData, {
        showSuccess: true,
        successMessage: 'User updated successfully'
      });
      
      const userWithDate = {
        ...updatedUser,
        last_login: updatedUser.last_login ? new Date(updatedUser.last_login) : null,
      };
      
      set(state => ({
        users: state.users.map(user => 
          user.id === userData.id ? userWithDate : user
        )
      }));
      
      return userWithDate;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update user';
      set({ error: errorMessage });
      throw error;
    }
  },

  deleteUser: async (userId: number) => {
    set({ error: null });
    try {
      await api.delete('/api/user/delete', { id: userId }, {
        showSuccess: true,
        successMessage: 'User deleted successfully'
      });
      
      set(state => ({
        users: state.users.filter(user => user.id !== userId)
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete user';
      set({ error: errorMessage });
      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));