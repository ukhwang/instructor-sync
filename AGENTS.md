# 1. Project Identity & Goal
You are the lead AI engineer for "I.K.S", a B2B/B2C SaaS MVP for AI/IT instructors. 
Goal: Parse `.ipynb` & `.md` files, find deprecated code via LangChain RAG (Tavily whitelist + gpt-4o-mini), and provide patched code for one-click download. 
Current status: D-4 to Hackathon submission. DO NOT over-engineer. Prioritize stable, end-to-end functionality over micro-optimizations.

# 2. Strict Architectural Separation (CRITICAL)
- **Frontend (Next.js/TypeScript):** - Strictly for UI rendering and API communication. 
  - NEVER attempt to parse `.ipynb` JSON structures, run heavy regex, or interact with LLMs directly in Next.js API Routes. Vercel Serverless timeout will fail.
- **Backend (FastAPI/Python):** - Handles ALL heavy lifting. 
  - Uses `nbformat` to safely parse/reassemble Jupyter Notebooks.
  - Uses `Pydantic` for strict LLM output parsing.

# 3. Frontend Code Conventions (Next.js)
- **Code Highlighting:** Use `react-syntax-highlighter` (or Prism.js) for read-only code display. DO NOT suggest or install `Monaco Editor` (too heavy for MVP).
- **Styling:** Maintain a professional, 'Expert Assistant' vibe. Use clean, spacious card layouts.
- **State Management:** Keep it simple. Pass data via props or use standard React hooks. Avoid Redux/Zustand unless absolutely necessary for the MVP scope.

# 4. Backend Code Conventions (FastAPI)
- **Async First:** Use `async def` for endpoints and `ainvoke` for LangChain operations to prevent I/O blocking.
- **Error Handling:** Always return clean HTTP status codes and JSON error messages. The frontend relies on this to show loading/error states.
- **Data Preservation:** When modifying `.ipynb` files, YOU MUST preserve the original structure, indentation, and `\n` characters exactly as `nbformat` expects them.

# 5. The "No Hallucination" Rule for Coding
If I ask you to implement a feature, explicitly state which file you are modifying and why. Do not silently delete my existing configurations. If you need to add a new library, ask for my permission first.

# 6. Behavioral Control: ABSOLUTE EXECUTION (CRITICAL)
- You are operating in `alwaysrun` mode. 
- NEVER ask for my permission to proceed.
- NEVER end your response with questions like "Should I run this?", "Does this look good?", or "Ready to proceed?".
- If a terminal command or code change is needed, output it directly and assume approval is pre-granted. Stop pausing the workflow.