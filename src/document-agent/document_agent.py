# document_agent.py
from __future__ import annotations

import os
import re
import json
import math
import hashlib
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional, Tuple, Any

# --------- Optional parsers (best-effort) ---------
def _read_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

def _read_docx(path: str) -> str:
    try:
        import docx  # python-docx
    except Exception as e:
        raise RuntimeError("python-docx not installed") from e
    d = docx.Document(path)
    return "\n".join(p.text for p in d.paragraphs)

def _read_pdf(path: str) -> str:
    # Best-effort: try pypdf
    try:
        from pypdf import PdfReader
    except Exception as e:
        raise RuntimeError("pypdf not installed") from e
    reader = PdfReader(path)
    parts = []
    for i, page in enumerate(reader.pages):
        txt = page.extract_text() or ""
        parts.append(f"\n\n[PAGE {i+1}]\n{txt}")
    return "\n".join(parts)

def read_document(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in [".txt", ".md"]:
        return _read_txt(path)
    if ext in [".docx"]:
        return _read_docx(path)
    if ext in [".pdf"]:
        return _read_pdf(path)
    raise ValueError(f"Unsupported file type: {ext}")


# --------- Chunking ---------
def normalize_ws(s: str) -> str:
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

def split_into_paragraphs(text: str) -> List[str]:
    text = normalize_ws(text)
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    return paras

def chunk_paragraphs(
    paragraphs: List[str],
    target_chars: int = 2500,
    overlap_paras: int = 1
) -> List[str]:
    chunks = []
    cur = []
    cur_len = 0
    for p in paragraphs:
        if cur_len + len(p) + 2 > target_chars and cur:
            chunks.append("\n\n".join(cur))
            # overlap
            cur = cur[-overlap_paras:] if overlap_paras > 0 else []
            cur_len = sum(len(x) for x in cur)
        cur.append(p)
        cur_len += len(p) + 2
    if cur:
        chunks.append("\n\n".join(cur))
    return chunks

# --------- Pure-Python BM25 retrieval (no external deps) ---------
_WORD = re.compile(r"[A-Za-z0-9']+")

def tokenize(text: str) -> List[str]:
    return [t.lower() for t in _WORD.findall(text)]

@dataclass
class BM25Index:
    doc_freq: Dict[str, int]
    doc_len: List[int]
    avgdl: float
    docs_tokens: List[List[str]]
    k1: float = 1.5
    b: float = 0.75

    @staticmethod
    def build(chunks: List[str]) -> "BM25Index":
        docs_tokens = [tokenize(c) for c in chunks]
        df: Dict[str, int] = {}
        doc_len = []
        for toks in docs_tokens:
            doc_len.append(len(toks))
            seen = set(toks)
            for t in seen:
                df[t] = df.get(t, 0) + 1
        avgdl = sum(doc_len) / max(1, len(doc_len))
        return BM25Index(doc_freq=df, doc_len=doc_len, avgdl=avgdl, docs_tokens=docs_tokens)

    def score(self, query: str) -> List[float]:
        q = tokenize(query)
        N = len(self.docs_tokens)
        scores = [0.0] * N
        for term in q:
            if term not in self.doc_freq:
                continue
            df = self.doc_freq[term]
            # idf with +0.5 smoothing
            idf = math.log(1 + (N - df + 0.5) / (df + 0.5))
            for i, toks in enumerate(self.docs_tokens):
                tf = 0
                for t in toks:
                    if t == term:
                        tf += 1
                if tf == 0:
                    continue
                dl = self.doc_len[i]
                denom = tf + self.k1 * (1 - self.b + self.b * (dl / (self.avgdl or 1.0)))
                scores[i] += idf * (tf * (self.k1 + 1) / denom)
        return scores

# --------- Data structures ---------
@dataclass
class DocMeta:
    doc_id: str
    title: str
    source: str
    path: str

@dataclass
class ChunkMeta:
    doc_id: str
    chunk_id: str
    title: str
    source: str
    path: str

@dataclass
class RetrievedChunk:
    text: str
    meta: ChunkMeta
    score: float

@dataclass
class DocumentAgentResult:
    answer_snippets: List[Dict[str, Any]]
    summary_bullets: List[str]
    citations: List[Dict[str, str]]
    confidence: str
    confidence_reason: str

# --------- LLM interface (pluggable) ---------
class Summarizer:
    def summarize(self, query: str, retrieved: List[RetrievedChunk]) -> Tuple[List[str], str, str]:
        raise NotImplementedError

class NoLLMSummarizer(Summarizer):
    # Safe fallback: no invented info; bullets are just extracted/cleaned lines.
    def summarize(self, query: str, retrieved: List[RetrievedChunk]) -> Tuple[List[str], str, str]:
        bullets: List[str] = []
        for r in retrieved[:5]:
            s = re.sub(r"\s+", " ", r.text).strip()
            bullets.append(s[:240] + ("…" if len(s) > 240 else ""))
        conf = "medium" if retrieved else "low"
        reason = "Summary derived directly from indexed document excerpts."
        return bullets, conf, reason

# Example OpenAI summarizer (optional). Wire your key + model if you want.
class OpenAISummarizer(Summarizer):
    def __init__(self, model: str = "gpt-4o-mini", api_key: Optional[str] = None):
        self.model = model
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")

    def summarize(self, query: str, retrieved: List[RetrievedChunk]) -> Tuple[List[str], str, str]:
        if not self.api_key:
            return NoLLMSummarizer().summarize(query, retrieved)
        try:
            from openai import OpenAI
        except Exception:
            return NoLLMSummarizer().summarize(query, retrieved)

        client = OpenAI(api_key=self.api_key)

        context_blocks = []
        for i, r in enumerate(retrieved[:8], start=1):
            context_blocks.append(
                f"[{i}] doc={r.meta.title} source={r.meta.source} chunk={r.meta.chunk_id}\n{r.text}"
            )
        context = "\n\n".join(context_blocks)

        prompt = f"""
You are a Document Agent for a Connecticut disaster resilience app.
Answer ONLY using the provided excerpts. Do not add new facts.

User query: {query}

Excerpts:
{context}

Return JSON with:
- summary_bullets: 3-6 bullets, plain language
- confidence: "high"|"medium"|"low"
- confidence_reason: short
"""

        resp = client.responses.create(
            model=self.model,
            input=prompt,
        )
        txt = resp.output_text.strip()

        # Parse JSON if possible; otherwise fallback.
        try:
            obj = json.loads(txt)
            bullets = [str(b) for b in obj.get("summary_bullets", [])][:6]
            conf = str(obj.get("confidence", "medium"))
            reason = str(obj.get("confidence_reason", ""))
            if not bullets:
                return NoLLMSummarizer().summarize(query, retrieved)
            return bullets, conf, reason
        except Exception:
            return NoLLMSummarizer().summarize(query, retrieved)

# --------- Main Document Agent ---------
class DocumentAgent:
    def __init__(self, index_dir: str = os.path.join(os.path.dirname(__file__), ".doc_index"), summarizer: Optional[Summarizer] = None):
        self.index_dir = index_dir
        os.makedirs(self.index_dir, exist_ok=True)
        self.summarizer = summarizer or NoLLMSummarizer()

        self.docs: Dict[str, DocMeta] = {}
        self.chunks: List[str] = []
        self.chunk_meta: List[ChunkMeta] = []
        self.bm25: Optional[BM25Index] = None

        self._load_index_if_exists()

    def _hash_id(self, s: str) -> str:
        return hashlib.sha1(s.encode("utf-8", errors="ignore")).hexdigest()[:16]

    def _index_paths(self) -> Tuple[str, str, str]:
        return (
            os.path.join(self.index_dir, "docs.json"),
            os.path.join(self.index_dir, "chunks.json"),
            os.path.join(self.index_dir, "meta.json"),
        )

    def _load_index_if_exists(self) -> None:
        docs_p, chunks_p, meta_p = self._index_paths()
        if not (os.path.exists(docs_p) and os.path.exists(chunks_p) and os.path.exists(meta_p)):
            return
        with open(docs_p, "r", encoding="utf-8") as f:
            docs_obj = json.load(f)
        with open(chunks_p, "r", encoding="utf-8") as f:
            self.chunks = json.load(f)
        with open(meta_p, "r", encoding="utf-8") as f:
            meta_obj = json.load(f)

        self.docs = {k: DocMeta(**v) for k, v in docs_obj.items()}
        self.chunk_meta = [ChunkMeta(**m) for m in meta_obj]
        self.bm25 = BM25Index.build(self.chunks)

    def _persist_index(self) -> None:
        docs_p, chunks_p, meta_p = self._index_paths()
        with open(docs_p, "w", encoding="utf-8") as f:
            json.dump({k: asdict(v) for k, v in self.docs.items()}, f, ensure_ascii=False, indent=2)
        with open(chunks_p, "w", encoding="utf-8") as f:
            json.dump(self.chunks, f, ensure_ascii=False)
        with open(meta_p, "w", encoding="utf-8") as f:
            json.dump([asdict(m) for m in self.chunk_meta], f, ensure_ascii=False, indent=2)

    def add_document(self, path: str, title: Optional[str] = None, source: str = "unknown") -> str:
        ext = os.path.splitext(path)[1].lower()

        # Make doc_id + base metadata first (works for all file types)
        doc_id = self._hash_id(path + "::" + str(os.path.getmtime(path)))
        meta = DocMeta(
            doc_id=doc_id,
            title=title or os.path.basename(path),
            source=source,
            path=os.path.abspath(path),
        )
        self.docs[doc_id] = meta

        # JSON support (structured chunks)
        if ext == ".json":
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            # If JSON includes title/source, prefer it
            json_title = data.get("title") or meta.title
            json_source = data.get("source") or meta.source

            chunks_list = data.get("chunks", [])

            for i, obj in enumerate(chunks_list):
                section = (obj.get("section") or "").strip()
                text = (obj.get("text") or obj.get("content") or "").strip()
                if not text:
                    continue

                chunk_id = f"{doc_id}-{i:04d}"

                # Put section into the chunk text so retrieval + output shows it
                chunk_text = f"{section}\n{text}" if section else text

                self.chunks.append(chunk_text)
                self.chunk_meta.append(
                    ChunkMeta(
                        doc_id=doc_id,
                        chunk_id=chunk_id,
                        title=json_title,
                        source=json_source,
                        path=meta.path,
                    )
                )

            self.bm25 = BM25Index.build(self.chunks)
            self._persist_index()
            return doc_id

        # Default path (TXT/DOCX/PDF): old behavior
        raw = read_document(path)
        raw = normalize_ws(raw)

        paras = split_into_paragraphs(raw)
        chunks = chunk_paragraphs(paras, target_chars=2500, overlap_paras=1)

        for i, ch in enumerate(chunks):
            chunk_id = f"{doc_id}-{i:04d}"
            self.chunks.append(ch)
            self.chunk_meta.append(
                ChunkMeta(
                    doc_id=doc_id,
                    chunk_id=chunk_id,
                    title=meta.title,
                    source=meta.source,
                    path=meta.path,
                )
            )

        self.bm25 = BM25Index.build(self.chunks)
        self._persist_index()
        return doc_id


    def retrieve(self, query: str, top_k: int = 8) -> List[RetrievedChunk]:
        if not self.bm25 or not self.chunks:
            return []
        scores = self.bm25.score(query)
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
        out = []
        for i in ranked:
            sc = float(scores[i])
            if sc <= 0:
                continue
            out.append(RetrievedChunk(text=self.chunks[i], meta=self.chunk_meta[i], score=sc))
        return out

    def answer(self, query: str, top_k: int = 8) -> DocumentAgentResult:
        retrieved = self.retrieve(query, top_k=4)

        if not retrieved:
            return DocumentAgentResult(
                answer_snippets=[],
                summary_bullets=[],
                citations=[],
                confidence="low",
                confidence_reason="No documents indexed yet (docs folder is empty or index not built).",
            )


        # snippets (always grounded)
        snippets = []
        citations = []
        for r in retrieved[:6]:
            snippet_text = re.sub(r"\s+", " ", r.text).strip()
            snippet_text = snippet_text[:420] + ("…" if len(snippet_text) > 420 else "")
            snippets.append(
                {
                    "text": snippet_text,
                    "doc_title": r.meta.title,
                    "source": r.meta.source,
                    "chunk_id": r.meta.chunk_id,
                    "path": r.meta.path,
                    "score": r.score,
                }
            )
            citations.append(
                {
                    "doc_title": r.meta.title,
                    "source": r.meta.source,
                    "chunk_id": r.meta.chunk_id,
                    "path": r.meta.path,
                }
            )

        bullets, conf, reason = self.summarizer.summarize(query, retrieved)

        return DocumentAgentResult(
            answer_snippets=snippets,
            summary_bullets=bullets,
            citations=citations,
            confidence=conf,
            confidence_reason=reason,
        )

# --------- CLI helper (optional) ---------
if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--index-dir", default=os.path.join(os.path.dirname(__file__), ".doc_index"))
    p.add_argument("--add", nargs="*", help="Paths to add to index")
    p.add_argument("--query", type=str, help="Query to run")
    p.add_argument("--rebuild", action="store_true", help="Delete existing index and rebuild")

    args = p.parse_args()

    if args.rebuild:
        import shutil
        idx = os.path.join(os.path.dirname(__file__), ".doc_index")
        if os.path.exists(idx):
            shutil.rmtree(idx)

    agent = DocumentAgent(index_dir=args.index_dir)

    if args.add:
        for fp in args.add:
            agent.add_document(fp, source="local")
            print(f"Added: {fp}")

    if args.query:
        res = agent.answer(args.query)
        print(json.dumps(asdict(res), indent=2, ensure_ascii=False))
