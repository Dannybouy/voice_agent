# RelayPay Voice Support Agent — Agent Instructions

## Project Overview

You are building and maintaining a **voice-based customer support agent for RelayPay** — a B2B fintech serving Nigerian startups and SMEs. The agent handles first-line support through a branded web page where customers speak their questions and receive spoken answers.

**Stack**: VAPI (voice pipeline) · Claude Sonnet 4.6 (LLM) · n8n Cloud (orchestration) · Supabase pgvector (RAG) · Airtable (structured data / reviewer dashboard)

---

## Architecture

```text
[Browser] → VAPI Web SDK → VAPI Platform (Deepgram STT → Claude Sonnet 4.6 → ElevenLabs TTS)
                                    ↓ synchronous tool calls
                           n8n Cloud Webhooks
                             ↙            ↘
                      Supabase             Airtable
                   (pgvector RAG)    (Escalations + Call Logs)
```

**Tool calls flow**: VAPI POSTs to n8n webhook URLs synchronously and waits for the response. Two tools exist:

- `search_knowledge_base` → n8n RAG Query workflow → Supabase vector search → returns context chunks
- `create_escalation` → n8n Escalation Handler workflow → Airtable record + email notification

**End-of-call webhook**: VAPI fires async POST to n8n Call Logger workflow → logs transcript/outcome to Airtable.

---

## File Structure

```text
index.html                        # Frontend — single file, VAPI Web SDK, RelayPay brand
supabase/
  schema.sql                      # Supabase pgvector setup SQL (run once)
n8n-workflows/
  kb-ingestion.json               # One-time PDF → Supabase ingestion workflow
  rag-query.json                  # VAPI tool handler: knowledge base search
  escalation-handler.json         # VAPI tool handler: create escalation record
  call-logger.json                # End-of-call webhook → Airtable call log
workflows/
  ingest_knowledge_base.md        # SOP for running the one-time ingestion
  handle_vapi_tool_calls.md       # SOP for the RAG + escalation tool handlers
  log_call.md                     # SOP for call logging
tools/                            # Python scripts for deterministic tasks (if needed)
.env                              # API keys — NEVER commit this file
```

---

## Knowledge Base

The **RelayPay Knowledge Base PDF** contains all approved content the agent may reference:

- Product Features (payments, invoicing, payouts, tracking, team access)
- Policies & Compliance (KYC/KYB, AML, account restrictions, data security)
- FAQ (getting started, onboarding, payments, fees, invoices, account issues, support)
- Release Notes & Known Limitations (v2.2–v2.4)

**Knowledge ingestion is one-time.** Do not re-ingest unless the KB PDF changes.

**Hybrid approach**: FAQ section is embedded directly in the VAPI system prompt for zero-latency answers on common questions. The full KB lives in Supabase pgvector for deeper retrieval.

---

## Decision Logic (from Decision Logic.pdf)

The agent follows 4 response paths — enforce this strictly:

1. **Answer directly** — question is general, factual, covered in documentation
2. **Ask a clarifying question** — question is vague or has multiple interpretations (one question at a time)
3. **Escalate to human** — account-specific issues, compliance, disputes, user frustration/repetition, KYC outcomes
4. **Decline gracefully** — question outside scope, would require guessing

---

## Escalation Policy (from Escalation Policy PDF)

When escalation is triggered:

1. Inform the user a specialist is required
2. Collect: **name**, **email**, **preferred callback time**
3. Determine **category**: Account Issue / Payment Issue / Compliance / Technical / Other
4. Call `create_escalation` tool — n8n writes to Airtable + sends email notification
5. Confirm callback to user, then end the call
6. **Never continue attempting to resolve the issue after escalation is triggered**

---

## Agent Constraints

- **Never reference external URLs or links in spoken responses**
- **Never share sensitive account data** (balances, transaction IDs, compliance decisions)
- **Never provide legal, tax, or financial advice**
- **Never disclose internal risk logic or compliance thresholds**
- **Never promise specific timelines or guarantee outcomes**
- Only serve **Nigerian** users (RelayPay's current market)

---

## n8n Workflow Conventions

- All VAPI tool-call webhooks use **Response Mode: "Respond to Webhook" node** — NEVER use "Immediately" for synchronous tool calls
- All webhooks respond with the VAPI tool result format:

  ```json
  { "results": [{ "toolCallId": "...", "result": "..." }] }
  ```

- Extract `toolCallId` from `body.message.toolCallList[0].id` and `arguments` from `body.message.toolCallList[0].arguments`
- The call logger uses "Immediately" response mode (async, fire-and-forget)
- Always add an **Error Trigger** node to escalation-handler.json for fallback notification

---

## VAPI Configuration

- **Transcriber**: Deepgram nova-2, language: en
- **Model**: Anthropic claude-sonnet-4-6, temperature: 0.3, maxTokens: 500
- **Voice**: ElevenLabs (voiceId: 21m00Tcm4TlvDq8ikWAM — "Rachel")
- **First message**: "Hello, thank you for calling RelayPay support. I'm Relay, your AI assistant. How can I help you today?"
- **End message**: "Thank you for contacting RelayPay. Have a great day!"

---

## Supabase Setup

- Table: `documents` with columns `id`, `content`, `metadata` (jsonb), `embedding` (vector 1536)
- Function: `match_documents` for cosine similarity search
- Embedding model: `text-embedding-3-small` (1536 dimensions) via OpenAI
- HNSW index: create AFTER initial ingestion

---

## Airtable Tables (Base: "RelayPay Voice Agent")

**Escalations**: Escalation ID, Timestamp, Caller Name, Caller Email, Category, Escalation Reason, Call Booked, Appointment Time, Status (New/In Progress/Resolved), Call ID

**Call Logs**: Call ID, Timestamp, Duration (seconds), Transcript, Outcome (Answered/Escalated/Declined/Dropped), Ended Reason, Summary, Agent Version

---

## Brand Guidelines (from Front-End Visual Brand Asset PDF)

- Primary: `#1B2E5E` (Deep Blue)
- Accent: `#00B4B4` (Teal Blue)
- Background: `#F7F8FA` (Off-White)
- Font: Inter (weights 400, 500, 600)
- Style: Professional, calm, minimal, trustworthy
- Avoid: bright colors, gradients, emojis, chat-bubble designs, experimental layouts

---

## How to Operate

1. **Read the relevant workflow SOP** before executing any task
2. **Use existing n8n workflow files** as the source of truth — update them when you make changes
3. **Check `.env`** for all API keys — never hardcode credentials
4. **When n8n workflows fail**: read the full error in n8n execution logs, fix the node, verify, then update the workflow JSON and SOP
5. **When VAPI tool calls fail**: check VAPI call logs for the HTTP status and response body from n8n
6. **After any change to the VAPI assistant**: note the change in a comment at the top of this file

---

## Environment Variables (.env)

```text
VAPI_PUBLIC_KEY=
VAPI_PRIVATE_KEY=
VAPI_ASSISTANT_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
AIRTABLE_TOKEN=
AIRTABLE_BASE_ID=
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
ESCALATION_EMAIL=
```
