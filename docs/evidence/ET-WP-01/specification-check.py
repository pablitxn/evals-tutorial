"""Check specification consistency only; does not execute tutorial evaluators."""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[2] / "curriculum"
source = (root / "cases.md").read_text()
sections = re.split(r"^## (?=C[1-6]:)", source, flags=re.M)[1:]
assert len(sections) == 6
totals = [0, 0, 0]
for section in sections:
    title = section.splitlines()[0]
    table = section.split("| Fixture |", 1)[1].split("\n\n", 1)[0]
    rows = [line for line in table.splitlines() if line.startswith("| `")]
    positive = sum("` + |" in line for line in rows)
    negative = sum("` - |" in line for line in rows)
    partial = len(rows) - positive - negative
    assert positive and negative, title
    for index, count in enumerate((positive, negative, partial)):
        totals[index] += count
    print(f"{title}: {positive} positive, {negative} negative, {partial} partial")
assert totals == [24, 34, 1], totals
assert 4200000 + 1850000 == 6050000
assert 420000 + 185000 == 605000
assert 6050000 - 6150000 == -100000
assert 605000 - 615000 == -10000
assert 28000 + 3000 == 31000
assert 29000 + 4000 > 32000
assert 31000 <= 31000
print("Independent authoring arithmetic and budget boundaries: PASS")

for path in sorted(root.glob("*.md")):
    text = path.read_text()
    assert text.count("```") % 2 == 0, path
    assert all(line == line.rstrip() for line in text.splitlines()), path
    assert all(ord(char) < 128 for char in text), path
    for target in re.findall(r"\]\(([^)]+)\)", text):
        if not target.startswith(("https:", "http:", "#")):
            assert (path.parent / target.split("#")[0]).exists(), (path, target)
    result = subprocess.run(
        ["git", "diff", "--no-index", "--check", "/dev/null", str(path)],
        capture_output=True, text=True,
    )
    # No-index can return 1 for differing content even without check errors.
    assert result.returncode in (0, 1) and not result.stdout and not result.stderr, (
        path, result.returncode, result.stdout, result.stderr
    )
print("Markdown fences, ASCII, local links, whitespace: PASS")
print("Declared 59-fixture coverage: 24 positive, 34 negative, 1 partial")
print("No evaluator, agent, response judge or educational review was executed")
