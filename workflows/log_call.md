# Workflow: Log Call

## Objective
Automatically record every completed call in the Airtable `Call Logs` table when VAPI sends an end-of-call webhook.

## Prerequisites
- Stage 1 complete (Airtable table created, credentials configured)
- Stage 3 complete (VAPI assistant configured with `serverUrl` pointing to this webhook)
- `call-logger.json` workflow imported and active in n8n

## Webhook URL
`https://[instance].app.n8n.cloud/webhook/vapi-call-logger`

This URL is set as the `serverUrl` on the **VAPI assistant object** (not as a tool). It receives all server-side events from VAPI for that assistant.

**Important**: The call logger uses `responseMode: "onReceived"` — it responds with HTTP 200 immediately and processes the data async. VAPI does not wait for a response from this endpoint.

## What VAPI Sends
VAPI sends multiple event types to the `serverUrl`. The workflow filters to only process `end-of-call-report`. Other events (e.g. `status-update`, `transcript`) are silently discarded.

The `end-of-call-report` payload contains:
- `message.call` — call metadata (id, startedAt, endedAt, endedReason)
- `message.artifact` — post-call data (transcript, recordingUrl)
- `message.analysis` — AI-generated summary (if enabled in assistant config)
- `message.endedReason` — why the call ended

## Flow
```
Webhook (respond 200 immediately)
  → IF: message.type === "end-of-call-report"
      → Extract Call Data
          → Airtable: Create Call Log row
      (false branch: Ignore Other Events → No Op)
```

## Outcome Classification Logic
The `Extract Call Data` node classifies each call into one of four outcomes:

| Outcome | Detection |
|---------|-----------|
| **Escalated** | Transcript contains "escalat", "specialist", or "support team will contact" |
| **Dropped** | `endedReason` is `silence-timed-out`, `no-answer`, or `customer-did-not-answer` |
| **Declined** | Transcript contains "outside the scope", "cannot confidently", or "not able to help" |
| **Answered** | All other cases (default) |

Adjust these keyword checks in the Code node if classification is inaccurate.

## Airtable Fields Written
| Field | Source |
|-------|--------|
| Call ID | `message.call.id` |
| Timestamp | `message.call.startedAt` |
| Duration (seconds) | `endedAt - startedAt` in seconds |
| Transcript | `message.artifact.transcript` |
| Outcome | Classified by Code node |
| Ended Reason | `message.endedReason` |
| Summary | `message.analysis.summary` (if enabled) |
| Agent Version | Hardcoded as `v1.0` — update when the agent changes |

## Reviewing Call Logs in Airtable
The `Call Logs` table in the `RelayPay Voice Agent` Airtable base is the reviewer dashboard.

Useful Airtable views to create:
- **All Calls**: sorted by Timestamp descending
- **Escalated Only**: filter Outcome = "Escalated"
- **Today's Calls**: filter Timestamp = today

## Debugging
If a call isn't appearing in Airtable:
1. Check the n8n `VAPI Call Logger` execution log — confirm the webhook fired
2. If the IF node routed to the false branch: check that `message.type` equals exactly `end-of-call-report`
3. If Airtable node failed: check credential and that the base ID / table name match exactly
4. Check that the `serverUrl` on the VAPI assistant is the production webhook URL (not the test URL)

## Notes
- VAPI only sends the `end-of-call-report` after the call fully ends, including any post-call analysis. There may be a 5–10 second delay after the call ends before the webhook fires.
- If `analysisPlan.summaryPlan.enabled` is false in the VAPI assistant config, the Summary field will be empty.
- Long transcripts may exceed Airtable's long-text field limit — this is unlikely for support calls but worth noting.
- To cross-reference a call log with its escalation record, use the `Call ID` field present in both tables.
