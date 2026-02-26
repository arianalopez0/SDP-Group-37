import json
import requests

with open("secrets.env") as f:
    deepinfra_token=json.loads(f.read())["token"]
conversation=[]

headers={
    "Content-Type":"application/json",
    "Authorization":"Bearer "+deepinfra_token
}

def llm_query(messages,return_json=False):
    json_data = {
        "model": "meta-llama/Meta-Llama-3.1-8B-Instruct",
        "messages":messages,
        "properties":{
            "temperature":0.075,
        }
    }
    if return_json:
        json_data["properties"]["response_format"]="json"

    response=requests.post("https://api.deepinfra.com/v1/openai/chat/completions",headers=headers,json=json_data)
    return json.loads(response.content)["choices"][0]["message"]["content"]

def llm_query_response(prompt,query):
    conversation.append({"user":query})
    response=llm_query([
            {"role": "system", "content": f"""You are an emergency response summarization assistant.
                Here are the previous messages in the conversation: {json.dumps(conversation)}"""},
            {"role": "user", "content": prompt}
        ]).strip()
    conversation.append({"you":response})
    return response

def llm_query_orchestration(prompt):
    response=llm_query([
            {"role": "system", "content": prompt}
        ],
        True)
    return json.loads(response.replace("'","\"").lower())
    
if __name__=="__main__":
    print(llm_query_orchestration("Just testing this out!"))