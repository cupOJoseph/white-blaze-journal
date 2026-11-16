"""Extract the author's posts from the loosely formatted Markdown source."""

from __future__ import annotations

from datetime import datetime
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/Users/cupo/Downloads/trail posts.md')
DEST = ROOT / 'jsons' / 'posts.json'
DEST_JS = ROOT / 'dist' / 'posts.js'


class PostText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self.link: str | None = None

    def handle_starttag(self, tag, attrs):
        if tag == 'br':
            self.parts.append('\n')
        elif tag == 'li':
            self.parts.append('\n• ')
        elif tag in ('p', 'ul'):
            self.parts.append('\n')
        elif tag == 'a':
            self.link = dict(attrs).get('href')

    def handle_endtag(self, tag):
        if tag == 'a' and self.link:
            self.parts.append(f' ({self.link})')
            self.link = None

    def handle_data(self, data):
        self.parts.append(data)


def clean(value: str) -> str:
    value = value.strip().rstrip(',').strip()
    value = value.lstrip('*').rstrip('*').strip()
    value = value.strip('"“”').strip()
    value = re.sub(r'\\([!$#<>_&\-=:])', r'\1', value)
    return unescape(value)


def field(chunk: str, name: str) -> str:
    match = re.search(
        rf'(?m)^\s*\*?\s*["“”]?(?:{name})["“”]?\s*:\s*([^\n]+)', chunk
    )
    return clean(match.group(1)) if match else ''


def body(chunk: str) -> str:
    match = re.search(
        r'(?ms)^\s*"post"\s*:\s*"(.*?)^\s*"img"\s*:', chunk
    )
    if not match:
        raise ValueError('Post body not found')
    raw = match.group(1).rstrip().rstrip(',').rstrip('"”').rstrip()
    raw = re.sub(r'\\([!$#<>_&\-=:])', r'\1', raw)
    parsed = PostText()
    parsed.feed(raw)
    text = unescape(''.join(parsed.parts))
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n[ \t]+', '\n', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def coordinate(value: str, longitude: bool = False) -> float:
    match = re.search(r'-?\d+(?:\.\d+)?', value)
    if not match:
        raise ValueError(f'Invalid coordinate: {value!r}')
    result = float(match.group())
    # The Erwin entry dropped its minus sign in the source.
    return -result if longitude and result > 0 else result


text = SOURCE.read_text()
starts = list(re.finditer(r'(?m)^\s*["“”]?(?:id|Id)["“”]?\s*:', text))
posts = []
for index, start in enumerate(starts):
    chunk = text[start.start() : starts[index + 1].start() if index + 1 < len(starts) else len(text)]
    title = field(chunk, 'title|Title')
    if not title:
        continue  # Empty template entry at the top of the file.
    date = field(chunk, 'date')
    if date == 'reference':
        date_iso = None
    else:
        if date.count('/') == 1:
            date += '/2019'
        date_iso = datetime.strptime(date, '%m/%d/%Y').date().isoformat()
    post_id = field(chunk, 'id|Id') or f'post-{index}'
    lon = field(chunk, 'lon')
    # The Atlanta entry has Markdown emphasis around its lon key.
    if not lon:
        lon_match = re.search(r'(?m)^\s*\*"lon"\s*:\s*([^\n]+)', chunk)
        lon = clean(lon_match.group(1)) if lon_match else ''
    posts.append({
        'id': post_id,
        'date': date_iso,
        'title': title,
        'lat': coordinate(field(chunk, 'lat')),
        'lon': coordinate(lon, longitude=True),
        'post': body(chunk),
        'img': field(chunk, 'img'),
        'kind': 'prelude' if not date_iso or date_iso < '2019-05-01' else 'trail',
    })

# The two undated Massachusetts notes are trail notes, not pre-hike notes.
for post in posts:
    if post['date'] is None:
        post['kind'] = 'trail'

assert len(posts) == 53, len(posts)
assert sum(p['kind'] == 'trail' for p in posts) == 49
assert all(p['post'] and p['title'] for p in posts)
DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.write_text(json.dumps(posts, ensure_ascii=False, indent=2) + '\n')
DEST_JS.write_text('window.TRAIL_POSTS = ' + json.dumps(posts, ensure_ascii=False) + ';\n')
print(f'Wrote {len(posts)} posts ({sum(p["kind"] == "trail" for p in posts)} trail) to {DEST}')
