import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

// Usernames are case-insensitive (phone keyboards like to capitalize the first letter).
export function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

// Hash of a throwaway password, compared against when the username doesn't exist so a
// wrong username takes as long as a wrong password. Created on first use.
let dummyHash;

export async function verifyPassword(password, hash) {
  if (!hash) {
    dummyHash ??= hashPassword('not-a-real-password');
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}
