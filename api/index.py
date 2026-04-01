from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import json
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from crewai import Agent, Task, Crew, Process, LLM
from crewai.tools import tool
import requests
from bs4 import BeautifulSoup

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Document store
document_store = {}

# LLM Configuration (Fast & Free)
llm = LLM(
    model="openai/gpt-4.1-mini",
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url="https://openrouter.ai/api/v1"
)

# ==================== TOOLS ====================

@tool("search_documents")
def search_documents(query: str) -> str:
    """Search through uploaded documents for specific information. Use this when user asks about uploaded files."""
    if not document_store:
        return "No documents have been uploaded yet. Ask user to upload documents first."
    
    results = []
    query_lower = query.lower()
    
    for doc_name, content in document_store.items():
        content_lower = content.lower()
        if query_lower in content_lower:
            # Find relevant sections
            lines = content.split('\n')
            relevant = []
            for i, line in enumerate(lines):
                if query_lower in line.lower():
                    # Get context (2 lines before and after)
                    start = max(0, i-2)
                    end = min(len(lines), i+3)
                    context = '\n'.join(lines[start:end])
                    relevant.append(context)
                    if len(relevant) >= 3:  # Limit to 3 excerpts per doc
                        break
            
            if relevant:
                results.append(f"📄 {doc_name}:\n" + "\n---\n".join(relevant))
    
    if results:
        return "\n\n".join(results)
    else:
        return f"No relevant information found for '{query}' in uploaded documents."

@tool("web_search")
def web_search(query: str) -> str:
    """Search the web for current information. Use when documents don't have the answer or need external data."""
    try:
        # Using DuckDuckGo HTML (no API key needed)
        url = f"https://html.duckduckgo.com/html/?q={query}"
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=5)
        
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        for result in soup.find_all('div', class_='result')[:3]:  # Top 3 results
            title = result.find('a', class_='result__a')
            snippet = result.find('a', class_='result__snippet')
            if title and snippet:
                results.append(f"**{title.get_text()}**\n{snippet.get_text()}")
        
        if results:
            return "🌐 Web Search Results:\n\n" + "\n\n".join(results)
        else:
            return "No web results found. Try rephrasing the query."
    except Exception as e:
        return f"Web search failed: {str(e)}"

# ==================== AGENTS ====================

def create_planner_agent():
    return Agent(
        role="Workflow Planner",
        goal="Analyze user query and decide which agents are needed and in what order",
        backstory="""You are a strategic planner who understands task complexity. 
        
Your job is to analyze the user's question and decide:
- If it's a simple question (facts, greetings, short answers) → Route directly to Writer (skip Researcher)
- If it needs document analysis → Use Researcher + Writer
- If it needs external info → Use Researcher with web search + Writer

Create a clear execution plan with reasoning.""",
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

def create_researcher_agent():
    return Agent(
        role="Research Specialist",
        goal="Find relevant information from documents or web to answer user's question",
        backstory="""You are an expert researcher who finds and extracts key information.

Your process:
1. First, check uploaded documents using search_documents tool
2. If documents don't have the answer, use web_search tool
3. Extract only relevant facts, data, and quotes
4. Cite your sources clearly (document name or web source)
5. Be concise - focus on what directly answers the question""",
        tools=[search_documents, web_search],
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

def create_writer_agent():
    return Agent(
        role="Response Writer",
        goal="Create clear, direct answers based on research or direct knowledge",
        backstory="""You are a professional writer who creates clear, helpful responses.

Your guidelines:
1. For simple questions: Answer directly and concisely
2. For complex queries: Use research findings to build comprehensive answer
3. Use markdown formatting (headers, lists, bold) for readability
4. Always cite sources when using research
5. If no good answer found: Be honest and suggest alternatives""",
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

# ==================== ENDPOINTS ====================

class ChatRequest(BaseModel):
    message: str
    context: str = ""

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    """Upload and store document"""
    try:
        file_path = UPLOAD_DIR / file.filename
        content = await file.read()
        
        with file_path.open("wb") as buffer:
            buffer.write(content)
        
        # Extract text based on file type
        if file.filename.endswith('.txt'):
            text_content = content.decode('utf-8', errors='ignore')
        elif file.filename.endswith('.pdf'):
            from pypdf import PdfReader
            text_content = "\n".join([p.extract_text() for p in PdfReader(file_path).pages])
        elif file.filename.endswith('.docx'):
            from docx import Document as DocxDocument
            doc = DocxDocument(file_path)
            text_content = "\n".join([p.text for p in doc.paragraphs])
        elif file.filename.endswith('.csv'):
            import pandas as pd
            text_content = pd.read_csv(file_path).to_string()
        else:
            text_content = content.decode('utf-8', errors='ignore')
        
        document_store[file.filename] = text_content
        
        return {
            "filename": file.filename,
            "size": f"{len(content)/1024:.1f}KB",
            "status": "uploaded"
        }
    except Exception as e:
        print(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent-chat")
async def agent_chat(request: ChatRequest):
    """Enhanced multi-agent system with dynamic routing"""
    
    async def event_generator():
        try:
            # Prepare context
            doc_context = ""
            if document_store:
                doc_context = f"\n\nAvailable Documents ({len(document_store)}):\n"
                for filename in document_store.keys():
                    doc_context += f"- {filename}\n"
            
            yield f"data: {json.dumps({'type': 'status', 'message': '🧠 Planning workflow...'})}\n\n"
            await asyncio.sleep(0.1)
            
            # STEP 1: Planner decides workflow
            planner = create_planner_agent()
            
            plan_task = Task(
                description=f"""Analyze this user query and create an execution plan:

Query: "{request.message}"
{doc_context}

Decide:
1. Is this a simple question that can be answered directly? (greetings, basic facts, simple questions)
2. Does it require searching uploaded documents?
3. Does it need web search for external information?

Output a plan in this format:
PLAN: [Simple/Research Required]
AGENTS NEEDED: [Writer only] OR [Researcher → Writer]
REASONING: [Why this approach]""",
                agent=planner,
                expected_output="A clear execution plan"
            )
            
            plan_crew = Crew(
                agents=[planner],
                tasks=[plan_task],
                process=Process.sequential,
                verbose=True
            )
            
            yield f"data: {json.dumps({'type': 'agent', 'agent': 'planner', 'status': 'working'})}\n\n"
            
            plan_result = plan_crew.kickoff()
            plan_text = str(plan_result)
            
            yield f"data: {json.dumps({'type': 'result', 'agent': 'planner', 'content': plan_text})}\n\n"
            yield f"data: {json.dumps({'type': 'agent', 'agent': 'planner', 'status': 'complete'})}\n\n"
            await asyncio.sleep(0.2)
            
            # STEP 2: Execute based on plan
            needs_research = "research required" in plan_text.lower() or "researcher" in plan_text.lower()
            
            if needs_research:
                yield f"data: {json.dumps({'type': 'status', 'message': '🔍 Researching information...'})}\n\n"
                
                # Research phase
                researcher = create_researcher_agent()
                writer = create_writer_agent()
                
                research_task = Task(
                    description=f"""Research this question: "{request.message}"
                    
{doc_context}

Instructions:
1. Use search_documents tool to check uploaded files first
2. If documents don't have the answer, use web_search tool
3. Extract relevant information with sources
4. Be thorough but concise""",
                    agent=researcher,
                    expected_output="Research findings with sources"
                )
                
                write_task = Task(
                    description=f"""Write a comprehensive answer to: "{request.message}"

Use the research findings to create a clear, well-formatted response.
Include citations and use markdown formatting.""",
                    agent=writer,
                    expected_output="Final answer in markdown",
                    context=[research_task]
                )
                
                crew = Crew(
                    agents=[researcher, writer],
                    tasks=[research_task, write_task],
                    process=Process.sequential,
                    verbose=True
                )
                
                yield f"data: {json.dumps({'type': 'agent', 'agent': 'researcher', 'status': 'working'})}\n\n"
                
                result = crew.kickoff()
                
                # Stream results
                yield f"data: {json.dumps({'type': 'agent', 'agent': 'researcher', 'status': 'complete'})}\n\n"
                yield f"data: {json.dumps({'type': 'result', 'agent': 'researcher', 'content': str(research_task.output)[:500]})}\n\n"
                await asyncio.sleep(0.2)
                
                yield f"data: {json.dumps({'type': 'status', 'message': '✍️ Writing final response...'})}\n\n"
                yield f"data: {json.dumps({'type': 'agent', 'agent': 'writer', 'status': 'working'})}\n\n"
                await asyncio.sleep(0.3)
                
                yield f"data: {json.dumps({'type': 'agent', 'agent': 'writer', 'status': 'complete'})}\n\n"
                yield f"data: {json.dumps({'type': 'result', 'agent': 'writer', 'content': str(write_task.output)[:500]})}\n\n"
                
                final_result = str(result)
                
            else:
                # Simple query - direct to writer
                yield f"data: {json.dumps({'type': 'status', 'message': '✍️ Writing direct response...'})}\n\n"
                
                writer = create_writer_agent()
                
                simple_task = Task(
                    description=f"""Answer this question directly: "{request.message}"
                    
This is a simple query that doesn't require research. Provide a clear, concise answer.""",
                    agent=writer,
                    expected_output="Direct answer"
                )
                
                simple_crew = Crew(
                    agents=[writer],
                    tasks=[simple_task],
                    process=Process.sequential,
                    verbose=True
                )
                
                yield f"data: {json.dumps({'type': 'agent', 'agent': 'writer', 'status': 'working'})}\n\n"
                
                result = simple_crew.kickoff()
                
                yield f"data: {json.dumps({'type': 'agent', 'agent': 'writer', 'status': 'complete'})}\n\n"
                yield f"data: {json.dumps({'type': 'result', 'agent': 'writer', 'content': str(simple_task.output)[:500]})}\n\n"
                
                final_result = str(result)
            
            # Send final result
            yield f"data: {json.dumps({'type': 'complete', 'result': final_result})}\n\n"
            
        except Exception as e:
            error_msg = f"Error: {str(e)}"
            print(f"Agent error: {error_msg}")
            yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )

@app.get("/documents")
async def list_documents():
    """List all uploaded documents"""
    return {
        "documents": list(document_store.keys()),
        "count": len(document_store)
    }

@app.delete("/documents/{filename}")
async def delete_document(filename: str):
    """Delete a document"""
    if filename in document_store:
        del document_store[filename]
        return {"status": "deleted", "filename": filename}
    raise HTTPException(status_code=404, detail="Document not found")

@app.get("/")
async def root():
    return {
        "message": "Enhanced Multi-Agent System with Dynamic Routing",
        "features": [
            "Planner Agent - Decides workflow",
            "Smart Routing - Skips unnecessary agents",
            "Document Search - Searches uploaded files",
            "Web Search - Finds external information",
            "Streaming - Real-time agent updates"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)