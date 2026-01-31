import re
from typing import List, Tuple, Optional

from py_pdf_parser.loaders import load_file
from py_pdf_parser.filtering import ElementList

# 1) Define heading patterns (start + stop)
EXPERIENCE_START = re.compile(
    r"^(Work\s+)?(professional\s+)?Experience|Work Experience|employment(\s+history)?$",
    re.IGNORECASE
)

NEXT_SECTION = re.compile(
    r"^(education|projects|skills|publications|certifications|awards|volunteering|"
    r"volunteer|summary|profile|interests|languages|references)$",
    re.IGNORECASE
)

def normalize(s: str) -> str:
    # PDF text can contain weird spacing; normalize lightly
    return re.sub(r"\s+", " ", s).strip().lower()

def is_heading(el) -> bool:
    """
    Heuristic: headings tend to be short and often have larger font / bold.
    Use whatever attributes are available in your py-pdf-parser version.
    """
    text = normalize(el.text())
    if len(text) == 0:
        return False
    # short-ish line, not a bullet
    if len(text) > 60:
        return False
    if text.startswith(("-", "•")):
        return False
    return True

def find_experience_section(elements: ElementList) -> Optional[Tuple[int, int]]:
    """
    Returns (start_index, end_index) in the flat element list,
    where start_index is the first element AFTER the Experience heading.
    """
    start_idx = None

    # Convert to list once so we can slice by index
    els = list(elements)

    for i, el in enumerate(els):
        t = normalize(el.text())
        if not t:
            continue

        if is_heading(el) and EXPERIENCE_START.match(t):
            start_idx = i + 1
            break

    if start_idx is None:
        return None

    # Find the next heading that looks like a new section
    end_idx = len(els)
    for j in range(start_idx, len(els)):
        t = normalize(els[j].text())
        if not t:
            continue
        if is_heading(els[j]) and NEXT_SECTION.match(t):
            end_idx = j
            break

    return (start_idx, end_idx)

def extract_experience_text(pdf_path: str) -> str:
    doc = load_file(pdf_path)
    elements = doc.elements  # ElementList

    span = find_experience_section(elements)
    if span is None:
        return ""

    start_idx, end_idx = span
    section_elements = list(elements)[start_idx:end_idx]

    # Keep ordering as in PDF; join lines
    lines = [normalize(el.text()) for el in section_elements if normalize(el.text())]
    return "\n".join(lines)

# Usage:
experience_text = extract_experience_text("/home/arshia/Desktop/cvtest2.pdf")
print(experience_text)
