-- Друзья: заявки и принятие. Истории видны только себе и принятым друзьям.

CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id),
    CONSTRAINT friendships_status_chk CHECK (status IN (0, 1)),
    UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee_pending
    ON friendships (addressee_id) WHERE status = 0;

CREATE INDEX IF NOT EXISTS idx_friendships_accepted_pair
    ON friendships (requester_id, addressee_id) WHERE status = 1;
