export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  customFetch,
  ApiError,
  setBaseUrl,
  getBaseUrl,
  setAuthTokenGetter,
  setAuthSessionRefresher,
  setAuthFailureHandler,
  setDegradedSecurityHandler,
} from "./custom-fetch";
export type {
  AuthTokenGetter,
  AuthSessionRefresher,
  AuthFailureHandler,
  DegradedSecurityHandler,
} from "./custom-fetch";
