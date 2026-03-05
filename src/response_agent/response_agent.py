import json
from ollama import chat
from ollama import ChatResponse
from src.orchestration.orchestration import main as run_orchestration
from src.LLM.LLM import llm_query_response as get_response

def generate_response(query, context):
    #Changed prompt to reflect new response agent role and to include document context if shelter data isn't needed but document data is
    prompt = f"""
You are a calm, friendly emergency response assistant.

Start your response with a short, warm introduction (2–3 sentences) that:
- Acknowledges the user's request
- Reassures them that the information is meant to help them make a decision

User question:
"{query}"

Your job:
- Respond to the user in a way that best answers their questions
- Be polite and helpful, the user may be in a stressful or life-threatening situation
- DO NOT output JSON and DO NOT add or invent any information
    """
    if len(context)>0:
        prompt = f"""
You are a calm, friendly emergency response assistant.

If the conversation has just started, begin your response with a short, warm introduction (2–3 sentences) that:
- Acknowledges the user's request
- Reassures them that the information is meant to help them make a decision
Otherwise, an introduction is not always necessary.

Output plain text only. Do NOT output JSON and do NOT invent information.

User question:
"{query}"

You will be given this JSON structure:
{{
"user_location": {{ ... }},"""
    if "document_context" in context:
        prompt+="""
"document_context": {{ ... }},
"""
    if "nearest_shelters" in context or "shelters" in context:
        prompt+="""
"nearest_shelters": [
    {
    "name": "...",
    "address": "...",
    "city": "...",
    "state": "...",
    "zip": "...",
    "status": "...",
    "handicap_accessible": "...",
    "location": { "lat": ..., "lon": ... },
    "straightline_distance_miles": ...,
    "route": { ... }   # may be null
        }
    ]
"""
    prompt+="""}

The JSON context may contain:
    - shelter information/directions under "shelters"
    - preparedness document information under "document_context"

The user cannot see this context. It exists only to help you inform them.
"""

    if "nearest_shelters" in context or "shelters" in context:
        prompt+="""
If shelters are present:
    - Start with a short, warm introduction (2-3 sentences)
    - Then summarize EACH shelter listed, with white space between entries.
    - If route information exists, include step-by-step directions. Otherwise, do NOT provide directions.
"""
    if "document_context" in context:
        prompt+="""
If document_context is present:
    - Add a section titled: "Preparedness Guidance (CT Guide)"
    - Use ONLY document_context.summary_bullets
    - If summary_bullets is empty, use document_context.answer_snippets
    - Do NOT add advice not supported by excerpts
    - Add a "Sources" section listing doc_title and source URL
"""
        if "nearest_shelters" not in context and "shelters" not in context:
            prompt+="""
If ONLY document_context exists (no shelters):
    - Write a short intro acknowledging the question
    - Then show the preparedness guidance section and sources
"""
    prompt+=f"""
Full Context JSON:
{json.dumps(context, indent=2)}
"""

    # Send prompt to LLM using the same get_response() pattern

    print(prompt)
    summary_text = get_response(prompt, query)

    return summary_text