# Workflow: Ingest Knowledge Base (One-Time)

## Objective
Parse the RelayPay Knowledge Base PDF, chunk it into semantic segments, generate embeddings, and store them in Supabase pgvector for RAG retrieval.

## Prerequisites
- Stage 1 complete: Supabase schema created, n8n credentials configured
- KB PDF uploaded to Google Drive with "Anyone with the link can view" sharing
- OpenAI API key added to n8n credentials
- n8n workflow `kb-ingestion.json` imported into n8n cloud

## Required Inputs
| Input | Where to find it |
|-------|-----------------|
| KB PDF direct download URL | Google Drive → Share → Copy link → convert to `https://drive.google.com/uc?export=download&id=FILE_ID` |
| Supabase credential (n8n) | n8n Settings > Credentials > Supabase |
| OpenAI credential (n8n) | n8n Settings > Credentials > OpenAI |

## Steps

### 1. Set the PDF URL
In the `Download PDF` node of the `KB Ingestion — One Time` workflow:
- Either set the `KB_PDF_URL` environment variable in n8n (Settings > Variables), or
- Directly paste the Google Drive download URL into the HTTP Request node's URL field

### 2. Verify credentials are linked
Open the workflow and confirm:
- `Download PDF` node uses no auth (the PDF is publicly accessible via Drive link)
- `Supabase Vector Store` node shows the Supabase credential
- `OpenAI Embeddings` sub-node shows the OpenAI credential

### 3. Run the workflow
Click `Execute` (manual trigger). The workflow will:
1. Download the PDF as binary
2. Extract full text from the PDF
3. Chunk text into ~500-word segments with 50-word overlap
4. For each chunk: generate an embedding via OpenAI and insert into Supabase `documents` table

Expected execution time: 2–5 minutes depending on PDF size and OpenAI latency.

### 4. Verify ingestion
Run in Supabase SQL Editor:
```sql
select count(*) from documents;
```
Expected: 50–200 rows.

Spot-check content:
```sql
select content, metadata from documents limit 5;
```
Content should be legible RelayPay text.

### 5. Create the HNSW index (after ingestion)
Run in Supabase SQL Editor:
```sql
create index on documents
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);
```
This speeds up similarity search. Must run AFTER data is loaded.

### 6. Archive the ingestion workflow
In n8n, toggle the `KB Ingestion — One Time` workflow to **inactive**. This prevents accidental re-runs which would create duplicate records.

## Expected Output
- `documents` table in Supabase populated with chunked KB content + embeddings
- HNSW index created
- Workflow set to inactive

## Error Handling
| Error | Likely cause | Fix |
|-------|-------------|-----|
| HTTP 403 on PDF download | Drive link not set to "Anyone with link" | Update Drive sharing settings |
| "No text extracted from PDF" | PDF is scanned images (not text-based) | Use a PDF OCR tool first to extract text, then re-upload |
| OpenAI rate limit error | Too many embedding requests too fast | n8n will retry automatically; if it fails, re-run the workflow (duplicates will be created — run `delete from documents;` first) |
| Supabase connection error | Wrong URL or service role key | Re-check credentials in n8n |

## Notes
- Ingestion is one-time. Do not re-run unless the KB PDF has been updated.
- If the KB changes, delete all existing rows first: `delete from documents;` then drop and recreate the index before re-running.
- Chunk size (500 words) and overlap (50 words) are tuned for this KB. Adjust in the Code node if retrieval quality is poor.
