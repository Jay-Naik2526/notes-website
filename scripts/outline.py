"""Print a PDF's bookmark outline as JSON: [{"t": title, "p": zero-based page, "l": depth}, ...]"""
import json
import sys

from pypdf import PdfReader

try:
    r = PdfReader(sys.argv[1])
    out = []

    def walk(items, level):
        for it in items:
            if isinstance(it, list):
                walk(it, level + 1)
                continue
            try:
                page = r.get_destination_page_number(it)
            except Exception:
                continue
            title = " ".join((getattr(it, "title", "") or "").split())
            if title and page is not None and page >= 0:
                out.append({"t": title, "p": page, "l": level})

    walk(r.outline, 0)
    print(json.dumps(out))
except Exception:
    print("[]")
