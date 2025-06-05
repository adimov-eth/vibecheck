-- User activity summary view
CREATE MATERIALIZED VIEW IF NOT EXISTS user_activity_summary AS
SELECT 
  u.id as user_id,
  u.email,
  u.created_at as user_created_at,
  COUNT(DISTINCT c.id) as total_conversations,
  COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.id END) as completed_conversations,
  COUNT(DISTINCT DATE(c.created_at)) as active_days,
  MAX(c.created_at) as last_activity_at,
  AVG(c.duration) as avg_conversation_duration,
  SUM(c.duration) as total_conversation_duration,
  COUNT(DISTINCT c.mode) as modes_used,
  COALESCE(s.status, 'none') as subscription_status,
  s.expires_at as subscription_expires_at
FROM users u
LEFT JOIN conversations c ON c.user_id = u.id
LEFT JOIN LATERAL (
  SELECT status, expires_at 
  FROM subscriptions 
  WHERE user_id = u.id 
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY created_at DESC 
  LIMIT 1
) s ON true
GROUP BY u.id, u.email, u.created_at, s.status, s.expires_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_summary_user_id 
  ON user_activity_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_summary_last_activity 
  ON user_activity_summary(last_activity_at DESC);

-- Conversation search view with full-text search
CREATE MATERIALIZED VIEW IF NOT EXISTS conversation_search AS
SELECT 
  c.id,
  c.user_id,
  c.mode,
  c.status,
  c.created_at,
  c.transcript,
  c.analysis,
  COALESCE(
    to_tsvector('english', COALESCE(c.transcript, '')),
    to_tsvector('simple', '')
  ) as search_vector
FROM conversations c;

CREATE INDEX IF NOT EXISTS idx_conversation_search_vector 
  ON conversation_search USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_conversation_search_user_id 
  ON conversation_search(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_search_created_at 
  ON conversation_search(created_at DESC);

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_activity_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_search;
END;
$$ LANGUAGE plpgsql;

-- Create slow query log table
CREATE TABLE IF NOT EXISTS slow_query_log (
  id SERIAL PRIMARY KEY,
  query_hash VARCHAR(32) NOT NULL,
  query_text TEXT NOT NULL,
  duration INTEGER NOT NULL,
  params_count INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX idx_slow_query_created_at (created_at DESC),
  INDEX idx_slow_query_duration (duration DESC),
  INDEX idx_slow_query_hash (query_hash)
);