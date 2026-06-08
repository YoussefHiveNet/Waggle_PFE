import os

ENABLED = os.getenv("AGENT_DEBUG", "1") == "1"


def log(tag: str, *parts):
    if not ENABLED:
        return
    header = f"\n{'─' * 60}\n[AGENT:{tag}]"
    body = "\n".join(str(p) for p in parts)
    print(header + "\n" + body, flush=True)
