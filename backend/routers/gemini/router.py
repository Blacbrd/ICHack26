# backend/gemini/router.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import importlib
import logging
import threading
import traceback

router = APIRouter()

# In-memory process-local storage (thread-safe)
PROMPT_LOCK = threading.Lock()
STORED_PROMPT: Optional[str] = None
STORED_SYSTEM_PROMPT: Optional[str] = None

RESPONSE_LOCK = threading.Lock()
STORED_RESPONSE: Optional[str] = None

# Request models
class SetPromptRequest(BaseModel):
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None

class GenerateRequest(BaseModel):
    model: Optional[str] = None
    # optional override system prompt
    system_prompt: Optional[str] = None

def import_call_gemini_module():
    """
    Import the user's call_gemini wrapper safely.
    We import by module name so the router doesn't hard-depend on a particular path structure.
    """
    try:
        module = importlib.import_module("gemini.call_gemini")
        return module
    except SystemExit:
        # call_gemini tried to exit (e.g. GEMINI_API_KEY missing). Let caller handle.
        logging.exception("gemini.call_gemini attempted to exit (likely missing GEMINI_API_KEY)")
        raise
    except Exception as exc:
        logging.exception("Failed to import backend.gemini.call_gemini")
        logging.debug(traceback.format_exc())
        raise

@router.post("/set_prompt")
def set_prompt(req: SetPromptRequest) -> Dict[str, Any]:
    """
    Save prompt/system_prompt and immediately call Gemini to create a response.
    Returns metadata about the saved values and whether Gemini was called successfully.
    """
    global STORED_PROMPT, STORED_SYSTEM_PROMPT, STORED_RESPONSE

    prompt_ok = isinstance(req.prompt, str) and req.prompt.strip() != ""
    system_ok = isinstance(req.system_prompt, str) and req.system_prompt.strip() != ""

    if not (prompt_ok or system_ok):
        raise HTTPException(status_code=400, detail="Either 'prompt' or 'system_prompt' must be provided and non-empty")

    p = req.prompt or ""
    sp = req.system_prompt or ""

    # store
    with PROMPT_LOCK:
        STORED_PROMPT = p
        STORED_SYSTEM_PROMPT = sp

    # reset response
    with RESPONSE_LOCK:
        STORED_RESPONSE = None

    # try to call gemini
    try:
        cg = import_call_gemini_module()
    except SystemExit:
        return {
            "status": "ok",
            "saved_prompt_length": len(p),
            "saved_system_prompt_length": len(sp),
            "gemini_called": False,
            "error": "call_gemini attempted to exit (likely missing GEMINI_API_KEY). Check server logs."
        }
    except Exception as exc:
        return {
            "status": "ok",
            "saved_prompt_length": len(p),
            "saved_system_prompt_length": len(sp),
            "gemini_called": False,
            "error": f"Import error: {str(exc)}"
        }

    generate_fn = getattr(cg, "generate_response", None)
    if not callable(generate_fn):
        return {
            "status": "ok",
            "saved_prompt_length": len(p),
            "saved_system_prompt_length": len(sp),
            "gemini_called": False,
            "error": "generate_response not found in backend.gemini.call_gemini"
        }

    try:
        # call with provided system prompt (can be empty string)
        gemini_text = generate_fn(system_prompt=sp, prompt=p)
        gemini_text_str = gemini_text if isinstance(gemini_text, str) else str(gemini_text)
        with RESPONSE_LOCK:
            STORED_RESPONSE = gemini_text_str

        return {
            "status": "ok",
            "saved_prompt_length": len(p),
            "saved_system_prompt_length": len(sp),
            "gemini_called": True,
            "gemini_length": len(gemini_text_str),
        }
    except SystemExit:
        logging.exception("call_gemini requested process exit while generating response")
        return {
            "status": "ok",
            "saved_prompt_length": len(p),
            "saved_system_prompt_length": len(sp),
            "gemini_called": False,
            "error": "call_gemini requested process exit. Check GEMINI_API_KEY and call_gemini implementation."
        }
    except Exception as exc:
        logging.exception("Error while calling Gemini")
        logging.debug(traceback.format_exc())
        return {
            "status": "ok",
            "saved_prompt_length": len(p),
            "saved_system_prompt_length": len(sp),
            "gemini_called": False,
            "error": f"Gemini generation failed: {str(exc)}"
        }

@router.get("/get_prompt")
def get_prompt():
    with PROMPT_LOCK:
        return {"prompt": STORED_PROMPT, "system_prompt": STORED_SYSTEM_PROMPT}

@router.get("/get_response")
def get_response():
    with RESPONSE_LOCK:
        return {"response": STORED_RESPONSE}
