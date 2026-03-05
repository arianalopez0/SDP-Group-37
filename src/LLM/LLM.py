import json
import requests

with open("secrets.env") as f:
    deepinfra_token=json.loads(f.read())["token"]
conversation=[]

headers={
    "Content-Type":"application/json",
    "Authorization":"Bearer "+deepinfra_token
}

def llm_query(messages,return_json=False,temp=0.075):
    json_data = {
        "model": "meta-llama/Meta-Llama-3.1-8B-Instruct",
        "messages":messages,
        "properties":{
            "temperature":temp,
        }
    }
    if return_json:
        json_data["properties"]["response_format"]="json"

    response=requests.post("https://api.deepinfra.com/v1/openai/chat/completions",headers=headers,json=json_data)
    return json.loads(response.content)["choices"][0]["message"]["content"]

def llm_query_response(prompt,query):
    if len(conversation)>16:
        conversation.pop_front()
        conversation.pop_front()
    conversation.append({"user":query})
    
    response=llm_query([
            {"role": "system", "content": f"""You are an emergency response summarization assistant.
Here are the previous messages in the conversation: 
{json.dumps(conversation)}"""},
            {"role": "user", "content": prompt}
        ]).strip()
    
    conversation.append({"you":response})
    return response

def llm_query_orchestration(prompt):
    attempts=0
    while attempts<20:
        attempts+=1
        try:
            response=llm_query([
                    {"role": "system", "content": prompt}
                ],
                True,0)
            response_dict=json.loads(response.lower())
            return response_dict
        except json.decoder.JSONDecodeError:
            try:
                response_dict=json.loads(response.lower()+"}")
                return response_dict
            except:
                print("Invalid JSON generated in orchestration, trying again")
        except Exception as e:
            print(type(e))
            print("Invalid JSON generated in orchestration, trying again")
    return None
    
#added document agent query function 
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
        except Exception:
            pass

    return {"summary_bullets": [], "confidence": "low", "confidence_reason": "Document LLM summarization failed; using fallback excerpts only."}




if __name__=="__main__":
    print(llm_query_orchestration("Just testing this out!"))