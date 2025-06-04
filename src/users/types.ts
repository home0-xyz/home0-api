export interface User {
  id: string; // Clerk user ID
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
  created_at: string;
  updated_at: string;
  last_login_at: string;
  metadata?: Record<string, any>;
}

export interface CreateUserRequest {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
  metadata?: Record<string, any>;
}