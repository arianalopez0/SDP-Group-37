"""All LLM calls go through here"""
import json
import requests

# secrets.env should be a json object with a single key "token" where its value is your openai token
with open("secrets.env") as f:
    openai_token=json.loads(f.read())["token"]
conversation=[]

headers={
    "Content-Type":"application/json",
    "Authorization":"Bearer "+openai_token
}

"""Makes a post request to the openai response api with the desired format, verbosity, temperature, and prompts"""
def llm_query(messages,return_json=False,temp=0.075,verbosity="medium"):
    json_data = {
        "model": "gpt-5.4-nano",
        "input":messages,
        "temperature":temp,
    }
    if return_json:
        json_data["text"]={"format":{"type":"json_object"}}
    else:
        json_data["text"]={"verbosity":verbosity}

    response=requests.post("https://api.openai.com/v1/responses",headers=headers,json=json_data)
    return json.loads(response.content)["output"][0]["content"][0]["text"]

"""Method used when calling LLM from response agent"""
def llm_query_response(prompt,query):
    response=llm_query([
            {"role": "system", "content": f"""You are an emergency response summarization assistant.
Here are the previous messages in the conversation: 
{json.dumps(conversation)}"""}, # Has access to previous messages
            {"role": "user", "content": prompt} # prompt sent in from here
        ],False,0.075,"low").strip() # not json, default temp, low verbosity.
    
    # record conversation (up to 16 messages)
    if len(conversation)>16:
        conversation.pop(0)
        conversation.pop(0)
    conversation.append({"user":query})
    conversation.append({"you":response})
    return response

"""Method used when calling LLM from orchestration agent"""
def llm_query_orchestration(prompt):
    attempts=0
    # Rarely, LLM generates invalid json. Try multiple times in this case.
    while attempts<20:
        attempts+=1
        try:
            response=llm_query([
                    {"role": "system", "content": prompt},
                    {"role": "system", "content": f"Here are the previous messages in the conversation:\n{json.dumps(conversation)}"},
                ],
                True,0)
            response_dict=json.loads(response.lower())
            return response_dict
        except json.decoder.JSONDecodeError: # If JSON could not load response:
            try:
                # Most of the time it just forgets to enclose the final curly bracket
                response_dict=json.loads(response.lower()+"}")
                return response_dict
            except:
                print("Invalid JSON generated in orchestration, trying again")
        except Exception as e:
            print(type(e))
            print("Invalid JSON generated in orchestration, trying again")
            break
    # exit if invalid json generated 20 times (shouldn't happen) or other error was detected (most likely connection)
    return None
    
"""Method used when calling LLM from document agent"""
def llm_query_document(query, excerpts, temp=0.0):
    """
    query: str
    excerpts: list of dicts like:
      [{"i":1,"title":"...","source":"...","chunk_id":"...","text":"..."}, ...]
      (you can pass whatever, we just stringify it)
    Returns dict:
      {"summary_bullets":[...], "confidence":"high|medium|low", "confidence_reason":"..."}
    """
    prompt = f"""
You are the Document Agent for a CT disaster resilience app.

RULES:
- Use ONLY the provided excerpts.
- Do NOT add new facts.
- If excerpts are insufficient, say so via low confidence.
- Return ONLY valid JSON.

User query:
{query}

Excerpts (JSON):
{json.dumps(excerpts, ensure_ascii=False, indent=2)}

Return JSON exactly with:
{{
  "summary_bullets": ["..."],
  "confidence": "high|medium|low",
  "confidence_reason": "..."
}}
"""

    attempts = 0
    while attempts < 10:
        attempts += 1
        try:
            # Generate json
            resp = llm_query(
                [{"role": "system", "content": prompt}],
                True,
                temp
            )
            obj = json.loads(resp)
            bullets = obj.get("summary_bullets", [])
            conf = obj.get("confidence", "medium")
            reason = obj.get("confidence_reason", "")
            if not isinstance(bullets, list):
                bullets = []
            bullets = [str(b) for b in bullets][:6]
            return {"summary_bullets": bullets, "confidence": str(conf), "confidence_reason": str(reason)}
        except Exception: # If JSON not generated correctly, try again
            pass

    # Return if generated invalid JSON 10 times
    return {"summary_bullets": [], "confidence": "low", "confidence_reason": "Document LLM summarization failed; using fallback excerpts only."}




if __name__=="__main__":
    print(llm_query_orchestration("Just testing this out!"))