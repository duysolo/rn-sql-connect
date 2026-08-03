import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;

export interface Movie_Key {
  id: UUIDString;
  __typename?: 'Movie_Key';
}

export interface GetMovieByIdData {
  movie?: {
    id: UUIDString;
    title: string;
    releaseYear?: number | null;
    genre?: string | null;
    rating?: number | null;
    viewCount?: Int64String | null;
    releasedAt?: TimestampString | null;
    releasedOn?: DateString | null;
    metadata?: unknown | null;
  } & Movie_Key;
}

export interface GetMovieByIdVariables {
  id: UUIDString;
}

export interface ListMoviesByGenreData {
  movies: ({
    id: UUIDString;
    title: string;
    genre?: string | null;
    rating?: number | null;
  } & Movie_Key)[];
}

export interface ListMoviesByGenreVariables {
  genre?: string | null;
  limit?: number | null;
}

export interface GetMyReviewsData {
  reviews: ({
    id: UUIDString;
    body: string;
    createdAt: TimestampString;
  })[];
}

export interface CreateMovieData {
  movie_insert: Movie_Key;
}

export interface CreateMovieVariables {
  title: string;
  releaseYear?: number | null;
  genre?: string | null;
  rating?: number | null;
  viewCount?: Int64String | null;
  metadata?: unknown | null;
}

export interface UpdateMovieData {
  movie_update?: Movie_Key | null;
}

export interface UpdateMovieVariables {
  id: UUIDString;
  genre?: string | null;
  rating?: number | null;
}

export interface DeleteMovieData {
  movie_delete?: Movie_Key | null;
}

export interface DeleteMovieVariables {
  id: UUIDString;
}

interface GetMovieByIdRef {
  (vars: GetMovieByIdVariables): QueryRef<GetMovieByIdData, GetMovieByIdVariables>;
  (dc: DataConnect, vars: GetMovieByIdVariables): QueryRef<GetMovieByIdData, GetMovieByIdVariables>;
  operationName: string;
}
export const getMovieByIdRef: GetMovieByIdRef;

export function getMovieById(vars: GetMovieByIdVariables): QueryPromise<GetMovieByIdData, GetMovieByIdVariables>;

interface CreateMovieRef {
  (vars: CreateMovieVariables): MutationRef<CreateMovieData, CreateMovieVariables>;
  operationName: string;
}
export const createMovieRef: CreateMovieRef;
export function createMovie(vars: CreateMovieVariables): MutationPromise<CreateMovieData, CreateMovieVariables>;
