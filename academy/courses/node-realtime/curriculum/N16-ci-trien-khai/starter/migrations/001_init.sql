-- 001_init.sql — schema đầu tiên của TeamPulse: người dùng, kênh, tin nhắn.

CREATE TABLE users (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE channels (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL UNIQUE CHECK (name ~ '^[a-z0-9-]{2,32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id integer NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users (id),
  text       text NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_channel_id_id_idx ON messages (channel_id, id DESC);
