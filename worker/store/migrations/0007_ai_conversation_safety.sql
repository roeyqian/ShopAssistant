-- Isolate AI consultations by thread and make client submissions idempotent.
ALTER TABLE ai_conversations ADD COLUMN conversation_id TEXT;
ALTER TABLE ai_conversations ADD COLUMN client_message_id TEXT;
ALTER TABLE ai_conversations ADD COLUMN reply_to_message_id TEXT;

-- Keep existing records readable as legacy threads while new records always supply a UUID.
UPDATE ai_conversations
SET conversation_id = 'legacy-' || session_id
WHERE conversation_id IS NULL OR conversation_id = '';

CREATE INDEX IF NOT EXISTS idx_conversations_user_thread
  ON ai_conversations(user_id, conversation_id, ai_type, timestamp);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_user_client_message
  ON ai_conversations(user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_reply_to_message
  ON ai_conversations(user_id, reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
