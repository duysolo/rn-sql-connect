import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




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

export interface DeleteMovieData {
  movie_delete?: Movie_Key | null;
}

export interface DeleteMovieVariables {
  id: UUIDString;
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

export interface GetMyReviewsData {
  reviews: ({
    id: UUIDString;
    body: string;
    createdAt: TimestampString;
  } & Review_Key)[];
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

export interface Movie_Key {
  id: UUIDString;
  __typename?: 'Movie_Key';
}

export interface Review_Key {
  id: UUIDString;
  __typename?: 'Review_Key';
}

export interface UpdateMovieData {
  movie_update?: Movie_Key | null;
}

export interface UpdateMovieVariables {
  id: UUIDString;
  genre?: string | null;
  rating?: number | null;
}

interface GetMovieByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetMovieByIdVariables): QueryRef<GetMovieByIdData, GetMovieByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetMovieByIdVariables): QueryRef<GetMovieByIdData, GetMovieByIdVariables>;
  operationName: string;
}
export const getMovieByIdRef: GetMovieByIdRef;

export function getMovieById(vars: GetMovieByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetMovieByIdData, GetMovieByIdVariables>;
export function getMovieById(dc: DataConnect, vars: GetMovieByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetMovieByIdData, GetMovieByIdVariables>;

interface ListMoviesByGenreRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars?: ListMoviesByGenreVariables): QueryRef<ListMoviesByGenreData, ListMoviesByGenreVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars?: ListMoviesByGenreVariables): QueryRef<ListMoviesByGenreData, ListMoviesByGenreVariables>;
  operationName: string;
}
export const listMoviesByGenreRef: ListMoviesByGenreRef;

export function listMoviesByGenre(vars?: ListMoviesByGenreVariables, options?: ExecuteQueryOptions): QueryPromise<ListMoviesByGenreData, ListMoviesByGenreVariables>;
export function listMoviesByGenre(dc: DataConnect, vars?: ListMoviesByGenreVariables, options?: ExecuteQueryOptions): QueryPromise<ListMoviesByGenreData, ListMoviesByGenreVariables>;

interface GetMyReviewsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetMyReviewsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetMyReviewsData, undefined>;
  operationName: string;
}
export const getMyReviewsRef: GetMyReviewsRef;

export function getMyReviews(options?: ExecuteQueryOptions): QueryPromise<GetMyReviewsData, undefined>;
export function getMyReviews(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetMyReviewsData, undefined>;

interface CreateMovieRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateMovieVariables): MutationRef<CreateMovieData, CreateMovieVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateMovieVariables): MutationRef<CreateMovieData, CreateMovieVariables>;
  operationName: string;
}
export const createMovieRef: CreateMovieRef;

export function createMovie(vars: CreateMovieVariables): MutationPromise<CreateMovieData, CreateMovieVariables>;
export function createMovie(dc: DataConnect, vars: CreateMovieVariables): MutationPromise<CreateMovieData, CreateMovieVariables>;

interface UpdateMovieRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateMovieVariables): MutationRef<UpdateMovieData, UpdateMovieVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateMovieVariables): MutationRef<UpdateMovieData, UpdateMovieVariables>;
  operationName: string;
}
export const updateMovieRef: UpdateMovieRef;

export function updateMovie(vars: UpdateMovieVariables): MutationPromise<UpdateMovieData, UpdateMovieVariables>;
export function updateMovie(dc: DataConnect, vars: UpdateMovieVariables): MutationPromise<UpdateMovieData, UpdateMovieVariables>;

interface DeleteMovieRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteMovieVariables): MutationRef<DeleteMovieData, DeleteMovieVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteMovieVariables): MutationRef<DeleteMovieData, DeleteMovieVariables>;
  operationName: string;
}
export const deleteMovieRef: DeleteMovieRef;

export function deleteMovie(vars: DeleteMovieVariables): MutationPromise<DeleteMovieData, DeleteMovieVariables>;
export function deleteMovie(dc: DataConnect, vars: DeleteMovieVariables): MutationPromise<DeleteMovieData, DeleteMovieVariables>;

