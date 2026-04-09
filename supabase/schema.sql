-- RelayPay Voice Agent — Supabase Schema
-- Run these statements in order in the Supabase SQL Editor.

-- ============================================================
-- STEP 1: Enable pgvector extension
-- ============================================================
create extension if not exists vector with schema extensions;

-- ============================================================
-- STEP 2: Create the documents table
-- n8n's Supabase Vector Store (LangChain) node expects this schema.
-- ============================================================
create table if not exists documents (
  id        bigserial primary key,
  content   text,
  metadata  jsonb,
  embedding extensions.vector(1536)
);

-- ============================================================
-- STEP 3: Create the similarity search function
-- Used by n8n's Supabase Vector Store node for retrieval.
-- ============================================================
create or replace function match_documents (
  query_embedding extensions.vector(1536),
  match_count     int     default null,
  filter          jsonb   default '{}'
)
returns table (
  id         bigint,
  content    text,
  metadata   jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ============================================================
-- STEP 4: Row Level Security
-- Enable RLS. The n8n service role key bypasses RLS by default,
-- but enabling it is best practice.
-- ============================================================
alter table documents enable row level security;

-- Allow service role full access (n8n uses service role key)
create policy "Service role full access"
  on documents
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- STEP 5: HNSW Index
-- Run ONLY AFTER the KB ingestion workflow has completed.
-- Running it before will slow down inserts significantly.
-- ============================================================
-- create index on documents
--   using hnsw (embedding extensions.vector_cosine_ops)
--   with (m = 16, ef_construction = 64);

-- ============================================================
-- VERIFICATION QUERIES
-- Run these to confirm setup is correct before proceeding.
-- ============================================================

-- Should return 0 rows with no error:
-- select count(*) from documents;

-- Should return empty result set with no error:
-- select match_documents(
--   array_fill(0::float, array[1536])::extensions.vector(1536),
--   5
-- );
