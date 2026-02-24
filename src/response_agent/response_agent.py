import json
from ollama import chat
from ollama import ChatResponse
from src.orchestration.orchestration import main as run_orchestration

#gets response from LLM
def get_response(prompt, model="llama3.1:8b"):
	response: ChatResponse = chat(
		model=model, 
		messages=[
            {"role": "system", "content": "You are an emergency response summarization assistant."},
            {"role": "user", "content": prompt}
        ],
		options={"temperature":0.075}
	)
	return response.message.content.strip()

def generate_response(query, context):
    #Changed prompt to reflect new response agent role and to include document context if shelter data isn't needed but document data is
    prompt = f"""
    You are a calm, friendly emergency response assistant.

    The JSON context may contain:
    - shelter information under "shelters"
    - preparedness document information under "document_context"

    Output plain text only. Do NOT output JSON and do NOT invent information.

    User question:
    "{query}"

    If shelters are present:
    - Start with a short, warm introduction (2-3 sentences)
    - Then summarize EACH shelter listed (one per line)
    - If route information exists, include brief directions

    If document_context is present:
    - Add a section titled: "Preparedness Guidance (CT Guide)"
    - Use ONLY document_context.summary_bullets
    - If summary_bullets is empty, use document_context.answer_snippets
    - Do NOT add advice not supported by excerpts
    - Add a "Sources" section listing doc_title and source URL

    If ONLY document_context exists (no shelters):
    - Write a short intro acknowledging the question
    - Then show the preparedness guidance section and sources
    
    Full Context JSON:
    {json.dumps(context, indent=2)}
    """

    # Send prompt to LLM using the same get_response() pattern

    summary_text = get_response(prompt)

    return summary_text