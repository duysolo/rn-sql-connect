/**
 * Fixture that mirrors the output of `firebase dataconnect:sdk:generate` for the
 * connector in example/dataconnect. Checked in so CI can run the generator and
 * compile its output without needing firebase-tools and an emulator.
 *
 * Regenerate with:
 *   firebase dataconnect:sdk:generate
 * and copy the javascriptSdk output over this directory.
 */
import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'example',
  location: 'asia-southeast1'
};

export const getMovieByIdRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetMovieById', inputVars);
}
getMovieByIdRef.operationName = 'GetMovieById';

export function getMovieById(dcOrVars, vars, options) {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeQuery(getMovieByIdRef(dcInstance, inputVars), options && { fetchPolicy: options.fetchPolicy });
}

export const listMoviesByGenreRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListMoviesByGenre', inputVars);
}
listMoviesByGenreRef.operationName = 'ListMoviesByGenre';

export const getMyReviewsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetMyReviews');
}
getMyReviewsRef.operationName = 'GetMyReviews';

export const createMovieRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateMovie', inputVars);
}
createMovieRef.operationName = 'CreateMovie';

export const updateMovieRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateMovie', inputVars);
}
updateMovieRef.operationName = 'UpdateMovie';

export const deleteMovieRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteMovie', inputVars);
}
deleteMovieRef.operationName = 'DeleteMovie';
