CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
 wallet integer NOT NULL CHECK (wallet >= 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 digest text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
 id text PRIMARY KEY, title text NOT NULL, details jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS classes (
 event_id text NOT NULL REFERENCES events(id), id text NOT NULL,
 name text NOT NULL, price integer NOT NULL CHECK (price > 0), details jsonb NOT NULL,
 PRIMARY KEY (event_id,id)
);
CREATE TABLE IF NOT EXISTS holds (
 id uuid PRIMARY KEY, event_id text NOT NULL REFERENCES events(id), user_id uuid NOT NULL REFERENCES users(id),
 class_id text NOT NULL, mode text NOT NULL CHECK (mode IN ('manual','auto')),
 state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','expired','released','confirmed','failed')),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (event_id,class_id) REFERENCES classes(event_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_hold ON holds(event_id,user_id) WHERE state='active';
CREATE TABLE IF NOT EXISTS queue_entries (
 id uuid PRIMARY KEY, seq bigserial UNIQUE, event_id text NOT NULL REFERENCES events(id),
 user_id uuid NOT NULL REFERENCES users(id), class_id text NOT NULL, quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 4),
 state text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting','admitted','holding','completed','cancelled','expired')),
 expires_at timestamptz, hold_id uuid REFERENCES holds(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (event_id,class_id) REFERENCES classes(event_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_queue_entry ON queue_entries(event_id,user_id) WHERE state IN ('waiting','admitted','holding');
CREATE INDEX IF NOT EXISTS queue_fifo ON queue_entries(event_id,class_id,seq) WHERE state='waiting';
CREATE TABLE IF NOT EXISTS bookings (
 id uuid PRIMARY KEY, reference text NOT NULL UNIQUE, user_id uuid NOT NULL REFERENCES users(id),
 event_id text NOT NULL REFERENCES events(id), hold_id uuid UNIQUE REFERENCES holds(id),
 total integer NOT NULL CHECK(total >= 0), state text NOT NULL DEFAULT 'confirmed' CHECK (state IN ('confirmed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), cancelled_at timestamptz
);
CREATE TABLE IF NOT EXISTS seats (
 event_id text NOT NULL REFERENCES events(id), id text NOT NULL, class_id text NOT NULL,
 row_label text NOT NULL, number integer NOT NULL, x real NOT NULL, y real NOT NULL, rotation real NOT NULL,
 status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','booked','reserved')),
 hold_id uuid REFERENCES holds(id), booking_id uuid REFERENCES bookings(id), reserved_reason text,
 PRIMARY KEY(event_id,id), FOREIGN KEY(event_id,class_id) REFERENCES classes(event_id,id),
 CHECK (status != 'held' OR hold_id IS NOT NULL), CHECK (status != 'booked' OR booking_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS seat_inventory ON seats(event_id,class_id,status);
CREATE TABLE IF NOT EXISTS tickets (
 id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id), event_id text NOT NULL,
 seat_id text NOT NULL, version integer NOT NULL DEFAULT 1, checked_in_at timestamptz,
 FOREIGN KEY (event_id,seat_id) REFERENCES seats(event_id,id)
);
CREATE TABLE IF NOT EXISTS payments (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), key text NOT NULL,
 hold_id uuid NOT NULL REFERENCES holds(id), outcome text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,key)
);
CREATE TABLE IF NOT EXISTS wallet_ledger (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), amount integer NOT NULL,
 kind text NOT NULL, reference text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS activity (
 id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), event_id text REFERENCES events(id),
 kind text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_time ON activity(created_at);
CREATE INDEX IF NOT EXISTS activity_user_kind ON activity(user_id,kind,created_at);
CREATE TABLE IF NOT EXISTS auth_attempts (
 id bigserial PRIMARY KEY, fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
