// Express 5 turns a thrown error with a `status` into that HTTP response (see app.js).
export function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}
