import fitz  # PyMuPDF
import os
import re
import json
from pathlib import Path


def extract_text_from_pdf(pdf_path):
    """Extract raw text from PDF."""
    doc = fitz.open(pdf_path)
    full_text = ""

    for page in doc:
        full_text += page.get_text()

    return full_text


def clean_text(text):
    """Basic cleaning: remove extra whitespace, fix line breaks."""
    # Remove excessive newlines
    text = re.sub(r'\n\s*\n', '\n\n', text)

    # Remove multiple spaces
    text = re.sub(r'[ \t]+', ' ', text)

    # Strip leading/trailing whitespace
    return text.strip()


def split_into_sections(text):
    """
    Attempt to split text into logical sections.
    Heuristic: split when lines are ALL CAPS or Title Case headings.
    """

    lines = text.split("\n")
    sections = []
    current_section = {
        "section": "Introduction",
        "text": ""
    }

    for line in lines:
        stripped = line.strip()

        # Detect potential section headers
        if (
            stripped.isupper() and len(stripped.split()) < 10
        ) or (
            stripped.istitle() and len(stripped.split()) < 10
        ):
            # Save previous section if it has content
            if current_section["text"].strip():
                sections.append(current_section)

            current_section = {
                "section": stripped,
                "text": ""
            }
        else:
            current_section["text"] += stripped + " "

    # Append final section
    if current_section["text"].strip():
        sections.append(current_section)

    return sections


def save_as_json(sections, output_path, title, source):
    """Save structured document as JSON."""
    structured_doc = {
        "title": title,
        "source": source,
        "chunks": sections
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(structured_doc, f, indent=4)

    print(f"Saved structured document to {output_path}")


def main():
    pdf_path = "src/rag/raw_pdfs/CTEmerPrepGuidepdf.pdf"
    output_dir = Path("src/rag/rag_documents")
    output_dir.mkdir(exist_ok=True)

    output_path = output_dir / "ct_emergency_preparedness_guide.json"

    title = "CT Emergency Preparedness Guide"
    source = "https://portal.ct.gov/-/media/departments-and-agencies/dph/dph/communications/preparedness/emerprepguidepdf.pdf"

    raw_text = extract_text_from_pdf(pdf_path)
    cleaned_text = clean_text(raw_text)
    sections = split_into_sections(cleaned_text)

    save_as_json(sections, output_path, title, source)


if __name__ == "__main__":
    main()