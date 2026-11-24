const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, handle TEXT NOT NULL UNIQUE, password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recovery (
    user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, hash TEXT NOT NULL,
    PRIMARY KEY (user, hash)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cookie TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exchanges (
    hash TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    challenge TEXT NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS access (
    hash TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tickets (
    hash TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS limits (
    scope TEXT PRIMARY KEY, reset INTEGER NOT NULL, count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS relationships (
    low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender TEXT NOT NULL, accepted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (low, high), CHECK (low < high)
  );
  CREATE INDEX IF NOT EXISTS relationship_high ON relationships(high);
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY, game TEXT NOT NULL, host TEXT NOT NULL, capacity INTEGER NOT NULL,
    phase TEXT NOT NULL DEFAULT 'open', match TEXT, state TEXT, final_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS seats (
    room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, seat INTEGER NOT NULL,
    user TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE, ready INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room, seat)
  );
  CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL, UNIQUE (room, recipient)
  );
  CREATE INDEX IF NOT EXISTS invitations_recipient ON invitations(recipient);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL, text TEXT NOT NULL, sent INTEGER NOT NULL, UNIQUE (room, user, client_id)
  );
  CREATE INDEX IF NOT EXISTS messages_room ON messages(room, id DESC);
  CREATE TABLE IF NOT EXISTS moves (
    room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, match TEXT NOT NULL,
    id TEXT NOT NULL, user TEXT NOT NULL,
    PRIMARY KEY (room, match, id)
  );
`

export class Database {
  constructor(private readonly storage: DurableObjectStorage) {
    this.storage.sql.exec(schema)
  }

  query<T extends Record<string, SqlStorageValue>>(sql: string, ...values: SqlStorageValue[]) {
    return this.storage.sql.exec<T>(sql, ...values).toArray()
  }

  first<T extends Record<string, SqlStorageValue>>(sql: string, ...values: SqlStorageValue[]) {
    return this.query<T>(sql, ...values)[0]
  }

  run(sql: string, ...values: SqlStorageValue[]) {
    this.storage.sql.exec(sql, ...values)
  }

  atomic<T>(task: () => T): T {
    return this.storage.transactionSync(task)
  }

  prune(now: number) {
    for (const table of ['tickets', 'exchanges', 'access', 'sessions', 'invitations'] as const) {
      this.run(`DELETE FROM ${table} WHERE expires <= ?`, now)
    }
    this.run('DELETE FROM limits WHERE reset <= ?', now)
    this.run('DELETE FROM messages WHERE sent < ?', now - 30 * 86_400_000)
  }

  allow(scope: string, max: number, windowMs: number) {
    const now = Date.now()
    const row = this.first<{ reset: number; count: number }>('SELECT reset, count FROM limits WHERE scope=?', scope)
    if (row && row.reset > now && row.count >= max) return false
    if (!row || row.reset <= now) {
      this.run('INSERT OR REPLACE INTO limits(scope, reset, count) VALUES (?, ?, 1)', scope, now + windowMs)
    } else {
      this.run('UPDATE limits SET count=count+1 WHERE scope=?', scope)
    }
    return true
  }
}
