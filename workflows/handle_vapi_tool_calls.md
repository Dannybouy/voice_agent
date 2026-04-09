# Workflow: Handle VAPI Tool Calls

## Objective
Serve two synchronous webhook endpoints that VAPI calls during a conversation:
1. `search_knowledge_base` — retrieve relevant KB context via RAG
2. `create_escalation` — log escalation to Airtable and notify support team

## Prerequisites
- Stage 1 complete (Supabase, Airtable, credentials)
- Stage 2 complete (KB ingested into Supabase)
- Stage 3 complete (VAPI assistant created with tool definitions)
- `rag-query.json` and `escalation-handler.json` workflows imported and active in n8n

## Webhook URLs
Both workflows must be **active** in n8n for their production URLs to be live:

| Tool | n8n Webhook Path | Full Production URL |
|------|-----------------|---------------------|
| `search_knowledge_base` | `vapi-rag-query` | `https://[instance].app.n8n.cloud/webhook/vapi-rag-query` |
| `create_escalation` | `vapi-escalation` | `https://[instance].app.n8n.cloud/webhook/vapi-escalation` |

These URLs must be set in the VAPI tool definitions under `server.url`.

## How VAPI Tool Calls Work

When Claude (inside VAPI) decides to call a tool:
1. VAPI sends an HTTP POST to the tool's server URL
2. The POST body contains `message.toolCallList[0]` with `{ id, function.name, function.arguments }`
3. VAPI waits (synchronously) for the n8n response
4. n8n must respond with `{ "results": [{ "toolCallId": "...", "result": "..." }] }`
5. VAPI passes the result back to Claude as tool output
6. Claude uses the result to continue the conversation

**Important**: Both tool-call workflows use `Respond to Webhook` node (not "Immediately"). This is what allows n8n to return a custom response body.

## RAG Query Workflow (rag-query.json)

### Flow
```
Webhook → Extract Tool Call → Supabase Vector Store (retrieve) + OpenAI Embeddings → Format Response → Respond to Webhook
```

### Key node: Extract Tool Call (Code)
Parses `body.message.toolCallList[0]` to get:
- `toolCallId` — must be returned in the response
- `query` — the user's question string to embed and search

### Key node: Supabase Vector Store
- Mode: `retrieve-as-text`
- Table: `documents`
- Query function: `match_documents`
- Limit: 4 chunks
- The query text comes from the `Extract Tool Call` output
- The OpenAI Embeddings sub-node generates the query embedding

### Key node: Format VAPI Response (Code)
Combines the 4 retrieved chunks into a context string:
```
Here is relevant information from the RelayPay knowledge base:

[Excerpt 1]: ...
[Excerpt 2]: ...
```
Returns `{ results: [{ toolCallId, result: contextString }] }`

### Debugging RAG
If Claude answers incorrectly or says it can't find information:
1. Check n8n execution log for this workflow
2. Inspect what the `Supabase Vector Store` node returned (are the chunks relevant?)
3. Try running a manual test: go to the Webhook node, copy the test URL, and POST a test payload:
   ```json
   {
     "body": {
       "message": {
         "toolCallList": [{
           "id": "test-123",
           "function": { "name": "search_knowledge_base", "arguments": "{\"query\": \"What documents do I need for KYC?\"}" }
         }]
       }
     }
   }
   ```

## Escalation Handler Workflow (escalation-handler.json)

### Flow
```
Webhook → Extract Escalation Data → Airtable Create → Send Email → Format Response → Respond to Webhook
(Error Trigger) → Fallback Error Email
```

### Key node: Extract Escalation Data (Code)
Parses `body.message.toolCallList[0].function.arguments` for:
- `caller_name`, `caller_email`, `preferred_time`
- `category` (one of: Account Issue / Payment Issue / Compliance / Technical / Other)
- `escalation_reason`
- `call_id`

### Key node: Airtable Create
Writes to the `Escalations` table in the `RelayPay Voice Agent` Airtable base.
Status is always set to `New` on creation.

### Key node: Send Email
Sends HTML email to the `ESCALATION_EMAIL` environment variable address with all caller details.

### Error Trigger
If any node fails, the Error Trigger fires the `Fallback Error Email` node which alerts the support team that a workflow failure occurred.

### Debugging Escalation
If an escalation call is not appearing in Airtable:
1. Check n8n execution log for `VAPI Escalation Handler`
2. Most common failure: Airtable credential expired or base ID wrong → update env var or re-auth
3. If email isn't arriving: check SMTP credentials, check spam folder

## Expected Behavior Summary

| User says | Claude does | n8n call | Airtable |
|-----------|-------------|----------|---------|
| "How do I add a beneficiary?" | Calls `search_knowledge_base` | RAG Query fires | No write |
| "I need to speak to a human" | Collects name/email/time → calls `create_escalation` | Escalation Handler fires | New row in Escalations |
| "What is RelayPay?" | Answers from inline FAQ | No tool call | No write |
| "What's the BTC price?" | Declines gracefully | No tool call | No write |

## Notes
- VAPI has a tool call timeout. If n8n takes >15 seconds, the tool call will fail. The RAG query should complete in 2–4 seconds normally.
- Never change the response format from `{ "results": [{ "toolCallId": "...", "result": "..." }] }` — VAPI requires this exact structure.
- If you add new tools to the VAPI assistant, create a corresponding n8n workflow and update this SOP.
