import { create } from 'zustand';
import { api } from '@app/utils/fetchUtils';
import { tryAsync } from '@src/utils/try';

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
    
    const [users, error] = await tryAsync(() => api.get('/api/user/list'));
    
    if (error) {
      set({ 
        error: error.message || 'Failed to fetch users',
        loading: false 
      });
    } else {
      set({ 
        users: (users as Array<{ id: number; email: string; username: string; name: string; last_login: string | null; status: 'Active' | 'Inactive' }>).map((user) => ({
          ...user,
          last_login: user.last_login ? new Date(user.last_login) : null,
        })),
        loading: false 
      });
    }
  },

  createUser: async (userData: CreateUserData) => {
    set({ error: null });
    
    const [newUser, error] = await tryAsync(() => api.post('/api/user/create', userData, {
      showSuccess: true,
      successMessage: 'User created successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to create user';
      set({ error: errorMessage });
      throw error;
    }
    
    const userWithDate = {
      ...newUser,
      last_login: newUser.last_login ? new Date(newUser.last_login) : null,
    };
    
    set(state => ({ 
      users: [...state.users, userWithDate]
    }));
    
    return userWithDate;
  },

  updateUser: async (userData: UpdateUserData) => {
    set({ error: null });
    
    const [updatedUser, error] = await tryAsync(() => api.put('/api/user/update', userData, {
      showSuccess: true,
      successMessage: 'User updated successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to update user';
      set({ error: errorMessage });
      throw error;
    }
    
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
  },

  deleteUser: async (userId: number) => {
    set({ error: null });
    
    const [, error] = await tryAsync(() => api.delete('/api/user/delete', { id: userId }, {
      showSuccess: true,
      successMessage: 'User deleted successfully'
    }));
    
    if (error) {
      const errorMessage = error.message || 'Failed to delete user';
      set({ error: errorMessage });
      throw error;
    }
    
    set(state => ({
      users: state.users.filter(user => user.id !== userId)
    }));
  },

  clearError: () => {
    set({ error: null });
  },
}));