import sys
from src.orchestration import orchestration
from src.response_agent.response_agent import generate_response

"""Testing for when not using front end"""
if __name__=="__main__":
    #Below lines can be uncommented to test orchestration agent's ability to classify queries' necessary agents (see test_queries in orchestration.py)
    #orchestration.test_queries()
    #quit()
    
    #default query
    query="What should be in an emergency preparedness kit?"
    
    # allow user to pass query from terminal
    if len(sys.argv) == 2:
        query = sys.argv[1]

    # 1. run orchestration (collects shelter and routing data)
    # NOTE: orchestration.main() already prints context, so this keeps existing behavior
    context = orchestration.main(query, 41.7658, -72.6734)

    if not context:
        print("No context returned from orchestration.")
        sys.exit(1)

    # 2. run the response agent to summarize the context
    output = generate_response(query, context)

    print("\n===== RESPONSE AGENT OUTPUT =====\n")
    print(output)
