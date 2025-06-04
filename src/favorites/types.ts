export interface Favorite {
  id: string;
  user_id: string;
  zpid: string;
  url: string;
  created_at: string;
  metadata?: FavoriteMetadata;
}

export interface FavoriteMetadata {
  address?: string;
  price?: number;
  imageUrl?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
}

export interface CreateFavoriteRequest {
  zpid: string;
  url: string;
  metadata?: FavoriteMetadata;
}

export interface FavoritesResponse {
  favorites: Favorite[];
  total: number;
  page: number;
  pageSize: number;
}