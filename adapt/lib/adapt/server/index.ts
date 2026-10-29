// server-only; Server runtime, request handling, action execution, access checks
if (!import.meta.env.SSR) {
  throw "server-only";
}
