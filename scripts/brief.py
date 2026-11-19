"""Write a plain-English buyer brief for a saved plan with a small open model running on this machine's GPU.

Run from the project root, in an environment with PyTorch (CUDA) and transformers, with the API running:
    VOYANCE_API_KEY=vy_... python scripts/brief.py 1          (plan id; VOYANCE_API defaults to the local API)
The model only explains: it gets the plan's facts (voyance.brief.facts), and a brief citing any number that isn't
in them is rejected and written again; after three tries a plain template is used instead. Nothing leaves this
machine: the model runs locally.
"""

import json
import logging
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from voyance.brief import facts, unknown_numbers  # noqa: E402

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"  # Apache-2.0, ~3 GB, fits a laptop GPU with room to spare
TRIES = 3
INSTRUCTIONS = (
    "You write short briefs for a hotel buyer at a travel distributor. Using ONLY the facts given, write at most "
    "120 words: one sentence on the plan as a whole, then at most 3 bullet points on the biggest buys and why, "
    "then one line on what to do first (the earliest buy-by date). Copy every figure exactly as written in the "
    "facts, with its unit (L means lakh, cr means crore). Never calculate, round, convert or invent a number."
)


def fetch_plan(plan_id: int) -> dict:
    base = os.environ.get("VOYANCE_API", "http://127.0.0.1:8000")
    if not base.startswith(("http://", "https://")):
        raise ValueError("VOYANCE_API must be an http(s) address")
    url = f"{base}/v1/plans/{plan_id}"
    request = urllib.request.Request(url, headers={"X-API-Key": os.environ["VOYANCE_API_KEY"]})  # noqa: S310
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 (http(s) checked above)
        return json.load(response)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    import torch
    from transformers import pipeline

    fact_text = facts(fetch_plan(int(sys.argv[1]) if len(sys.argv) > 1 else 1))
    writer = pipeline("text-generation", model=MODEL, device_map="cuda", dtype=torch.bfloat16)
    messages = [{"role": "system", "content": INSTRUCTIONS}, {"role": "user", "content": fact_text}]
    for attempt in range(1, TRIES + 1):
        options = {"do_sample": False} if attempt == 1 else {"do_sample": True, "temperature": 0.3}
        brief = writer(messages, max_new_tokens=400, **options)[0]["generated_text"][-1]["content"].strip()
        invented = unknown_numbers(brief, fact_text)
        if not invented:
            logging.info(f"{brief}\n\n(written on {torch.cuda.get_device_name(0)}; every number checked against "
                         f"the plan, attempt {attempt})")
            return
        logging.info(f"attempt {attempt} rejected: numbers not in the plan: {', '.join(invented)}")
    logging.info("The model kept inventing numbers; here are the plan's facts instead:\n" + fact_text)


if __name__ == "__main__":
    main()
