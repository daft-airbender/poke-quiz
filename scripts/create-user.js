// One-off: creates a login. There is deliberately no signup route; this is the only way.
//
//   npm run create-user <username>                                  # dev database (.env)
//   node --env-file=.env.production scripts/create-user.js <username>  # production
//
// Prompts for the password twice with hidden input. Refuses if the username exists.

import { eq } from 'drizzle-orm';
import { hashPassword, normalizeUsername } from '../src/auth/passwords.js';
import { createPool } from '../src/db/client.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { users } from '../src/db/schema.js';

const MIN_PASSWORD_LENGTH = 8;

// Reads one line from the terminal without echoing it.
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          return resolve(input);
        }
        if (char === '\u0003') {
          // Ctrl+C
          cleanup();
          stdout.write('\n');
          return reject(new Error('Cancelled'));
        }
        if (char === '\u007f' || char === '\b') input = input.slice(0, -1);
        else input += char;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

// Non-interactive fallback (e.g. piped input): first two lines are the password and confirmation.
async function readPipedLines() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text.split(/\r?\n/);
}

async function main() {
  const rawUsername = process.argv[2];
  if (!rawUsername) throw new Error('Usage: create-user <username>');
  const username = normalizeUsername(rawUsername);

  let password;
  let confirmation;
  if (process.stdin.isTTY) {
    password = await promptHidden('Password: ');
    confirmation = await promptHidden('Confirm password: ');
  } else {
    [password, confirmation] = await readPipedLines();
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password !== confirmation) throw new Error('Passwords do not match');

  const pool = createPool(process.env.DATABASE_URL);
  try {
    const db = drizzle(pool);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (existing) throw new Error(`User "${username}" already exists`);

    await db.insert(users).values({ username, passwordHash: await hashPassword(password) });
    console.log(`Created user "${username}".`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
