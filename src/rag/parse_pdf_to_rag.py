import fitz  # PyMuPDF
import re
import json
import argparse
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
RAW_PDF_DIR = BASE_DIR / "raw_pdfs"
OUTPUT_DIR = BASE_DIR / "rag_documents"

def extract_text_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    full_text = ""

    for page in doc:
        full_text += page.get_text()

    return full_text


def clean_text(text):
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


def split_into_sections(text):
    lines = text.split("\n")
    sections = []
    current_section = {"section": "Introduction", "text": ""}

    for line in lines:
        stripped = line.strip()

        if (
            stripped.isupper() and len(stripped.split()) < 10
        ) or (
            stripped.istitle() and len(stripped.split()) < 10
        ):
            if current_section["text"].strip():
                sections.append(current_section)

            current_section = {
                "section": stripped,
                "text": ""
            }
        else:
            current_section["text"] += stripped + " "

    if current_section["text"].strip():
        sections.append(current_section)

    return sections


def save_as_json(sections, output_path, title, source):
    structured_doc = {
        "title": title,
        "source": source,
        "chunks": sections
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(structured_doc, f, indent=4)

    print(f"\nSaved structured document to {output_path}")
    print(f"Total sections created: {len(sections)}\n")


def main():
    parser = argparse.ArgumentParser(description="Parse PDF into structured RAG JSON.")

    parser.add_argument("pdf_filename", help="Name of PDF file inside raw_pdfs/")
    parser.add_argument("output_filename", help="Name of output JSON file (no extension)")
    parser.add_argument("--title", default="Untitled Document", help="Document title")
    parser.add_argument("--source", default="Unknown Source", help="Document source URL")

    args = parser.parse_args()

    pdf_path = RAW_PDF_DIR / args.pdf_filename
    output_path = OUTPUT_DIR / f"{args.output_filename}.json"

    if not pdf_path.exists():
        print(f"\nPDF not found: {pdf_path}\n")
        return

    OUTPUT_DIR.mkdir(exist_ok=True)

    raw_text = extract_text_from_pdf(pdf_path)
    cleaned_text = clean_text(raw_text)
    sections = split_into_sections(cleaned_text)

    save_as_json(sections, output_path, args.title, args.source)


if __name__ == "__main__":
    main()