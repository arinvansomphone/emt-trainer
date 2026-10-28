CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  scenario_type TEXT,
  state TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);

-- Rolling summary of older turns. Messages are never deleted; the model sees
-- system messages + this summary + messages with id > upto_id.
CREATE TABLE IF NOT EXISTS summaries (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  upto_id INTEGER NOT NULL
);

-- Teacher dashboard. New tables only; sessions/messages/summaries are untouched.
CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_sessions (
  token TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subtype TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (class_id, email_normalized)
);

CREATE TABLE IF NOT EXISTS class_runs (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_class_runs_class ON class_runs(class_id);
