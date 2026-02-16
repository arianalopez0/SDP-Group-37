import json
import requests

with open("secrets.env") as f:
    deepinfra_token=json.loads(f.read())["token"]

headers={
    "Content-Type":"application/json",
    "Authorization":"Bearer "+deepinfra_token
}

def llm_query(messages,return_json=True):
    json_data = {
        "model": "meta-llama/Meta-Llama-3-8B-Instruct",
        "messages":messages
        "options":{"temperature":0.075}
    }
    if return_json:
        json_data["format"]="json"

    response=requests.post("https://api.deepinfra.com/v1/openai/chat/completions",headers=headers,json=json_data)
    print(response)
    return response.message.content

def llm_query_response(prompt):
    response=llm_query([
            {"role": "system", "content": "You are an emergency response summarization assistant."},
            {"role": "user", "content": prompt}
        ])
    return response.strip()

def llm_query_orchestration(prompt):
    response=llm_query([
            {"role": "system", "content": prompt}
        ],
        True)
    return response
    
if __name__=="__main__":
    print(llm_query_orchestration("Just testing this out!"))