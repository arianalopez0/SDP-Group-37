# Document Agent

The Document Agent indexes parsed documents (TXT, DOCX, PDF) and retrieves relevant excerpts to answer user queries in a **grounded, citation-based** way.  
It is designed to plug into the disaster resilience agent pipeline and safely handle cases where no documents are available.

---

## Folder Structure

```
document-agent/
├── document_agent.py
├── docs/           # Put documents to be indexed here
└── .doc_index/     # Generated index (do NOT commit)
```

Make sure `.doc_index/` is listed in `.gitignore`.

---

## Setup


### Install Dependencies

TXT files work with no extra installs.

For DOCX and PDF support:
```bash
pip install python-docx pypdf
```

(Optional) For OpenAI-based summarization:
```bash
pip install openai
```

---

## Adding Documents

Place documents in:
```
document-agent/docs/
```

Supported formats:
- `.txt`, `.md`
- `.docx`
- `.pdf`

---

## Indexing Documents

### Index a document
From the root

```powershell
python document-agent/document_agent.py --add document-agent/docs/demo.txt
```

### Rebuild the index (recommended if docs change)
```powershell
python document-agent/document_agent.py --rebuild --add document-agent/docs/demo.txt
```

Rebuilding clears old chunks so edited or replaced documents do not leave stale data.

---

## Querying the Document Agent

```powershell
python document-agent/document_agent.py --query "Should I drive during a flood?"
```

### Output

The agent prints JSON with:
- `answer_snippets`: retrieved document excerpts
- `summary_bullets`: grounded summary bullets
- `citations`: document metadata
- `confidence`: low / medium / high
- `confidence_reason`: explanation of confidence level

---

## Behavior With No Documents

If no documents are indexed:
- No snippets or summaries are returned
- `confidence` is set to `low`
- The agent does **not hallucinate** information

This is intentional and ensures safe behavior.

---

## Integration Notes

Recommended orchestration behavior:
- Call Document Agent when official guidance is required
- If `confidence == low`, do not present document-backed claims
- Otherwise, pass snippets and citations to the Response Agent

---

## Quick Demo Test

1. Create `document-agent/docs/demo.txt`:
```
During a flood, move to higher ground immediately.
Avoid driving through flooded roadways.
Follow instructions from local emergency management.
Prepare an emergency kit with water, food, and medications.
```

2. Rebuild and index:
```powershell
python document-agent/document_agent.py --rebuild --add document-agent/docs/demo.txt
```

3. Query:
```powershell
python document-agent/document_agent.py --query "Should I drive during a flood?"
```

You should see excerpts referencing “avoid driving through flooded roadways.”
