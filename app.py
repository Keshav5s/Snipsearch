# app.py
import os
import re
import json
import uuid
import time
import queue
import threading
from urllib.parse import urljoin, urldefrag, urlparse

import requests
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify, send_from_directory

DATA_DIR = "data"
DOCS_FILE = os.path.join(DATA_DIR, "docs.json")
INDEX_FILE = os.path.join(DATA_DIR, "index.json")

os.makedirs(DATA_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static", static_url_path="")

# --- Simple in-memory structures, persisted to disk ---
docs = {}       # doc_id -> {url, title, text, ts}
index = {}      # term -> {doc_id: tf}

# --- Helpers ---
def save_state():
    with open(DOCS_FILE, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

def load_state():
    global docs, index
    if os.path.exists(DOCS_FILE):
        docs = json.load(open(DOCS_FILE, encoding="utf-8"))
    if os.path.exists(INDEX_FILE):
        index = json.load(open(INDEX_FILE, encoding="utf-8"))

WORD_RE = re.compile(r"[a-z0-9]+")

def tokenize(text):
    text = text.lower()
    words = WORD_RE.findall(text)
    return words

def add_doc(url, title, text):
    # Avoid duplicates by url
    for did, d in docs.items():
        if d.get("url") == url:
            return did
    doc_id = str(uuid.uuid4())
    docs[doc_id] = {"url": url, "title": title, "text": text, "ts": time.time()}
    terms = tokenize(title + " " + text)
    freqs = {}
    for t in terms:
        freqs[t] = freqs.get(t, 0) + 1
    for t, f in freqs.items():
        if t not in index:
            index[t] = {}
        index[t][doc_id] = index[t].get(doc_id, 0) + f
    save_state()
    return doc_id

def snippet_for_doc(doc, terms, max_len=250):
    txt = doc.get("text", "")
    low = txt.lower()
    # find first occurrence of any term
    pos = None
    for t in terms:
        idx = low.find(t)
        if idx != -1:
            pos = idx
            break
    if pos is None:
        return txt[:max_len] + ("..." if len(txt) > max_len else "")
    start = max(0, pos - 80)
    end = min(len(txt), pos + 120)
    s = txt[start:end]
    return ("..." if start>0 else "") + s + ("..." if end < len(txt) else "")

# --- Crawler (simple BFS, depth-limited) ---
def fetch_url(url, timeout=8):
    try:
        r = requests.get(url, timeout=timeout, headers={"User-Agent":"SnipsearchBot/1.0"})
        if "text/html" in r.headers.get("Content-Type", ""):
            return r.text
    except Exception as e:
        print("fetch error", e)
    return None

def extract_links(html, base_url):
    soup = BeautifulSoup(html, "html.parser")
    links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        href = urljoin(base_url, href)
        href, _ = urldefrag(href)
        parsed = urlparse(href)
        if parsed.scheme in ("http", "https"):
            links.add(href)
    return links

def extract_title_text(html):
    soup = BeautifulSoup(html, "html.parser")
    for script in soup(["script","style","noscript"]):
        script.decompose()
    title_tag = soup.title.string.strip() if soup.title and soup.title.string else ""
    text = soup.get_text(separator=" ", strip=True)
    return title_tag, text

def crawl_worker(seed_urls, max_pages=50, max_depth=2, same_domain=False):
    visited = set()
    q = queue.Queue()
    for u in seed_urls:
        q.put((u, 0))
    pages = 0
    while not q.empty() and pages < max_pages:
        url, depth = q.get()
        if url in visited: 
            continue
        visited.add(url)
        html = fetch_url(url)
        if not html:
            continue
        title, text = extract_title_text(html)
        add_doc(url, title, text)
        pages += 1
        if depth < max_depth:
            for link in extract_links(html, url):
                if same_domain:
                    if urlparse(link).netloc != urlparse(url).netloc:
                        continue
                if link not in visited:
                    q.put((link, depth+1))
    print("crawl finished: pages", pages)

crawl_thread = None

@app.route("/api/crawl", methods=["POST"])
def api_crawl():
    global crawl_thread
    data = request.get_json() or {}
    seeds = data.get("seeds") or data.get("urls") or []
    max_pages = int(data.get("max_pages", 30))
    max_depth = int(data.get("max_depth", 1))
    same_domain = bool(data.get("same_domain", False))

    if not seeds:
        return jsonify({"error": "no seed urls provided"}), 400

    # run crawler in background thread to avoid blocking (simple)
    def runner():
        crawl_worker(seeds, max_pages=max_pages, max_depth=max_depth, same_domain=same_domain)
    crawl_thread = threading.Thread(target=runner, daemon=True)
    crawl_thread.start()
    return jsonify({"status":"started", "seeds": seeds}), 202

@app.route("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"results":[]})
    terms = tokenize(q)
    # simple scoring: sum term frequencies
    scores = {}
    for t in terms:
        postings = index.get(t, {})
        for doc_id, tf in postings.items():
            scores[doc_id] = scores.get(doc_id, 0) + tf
    # sort by score desc
    results = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    out = []
    for doc_id, score in results[:50]:
        d = docs.get(doc_id, {})
        snippet = snippet_for_doc(d, terms)
        out.append({
            "id": doc_id,
            "url": d.get("url"),
            "title": d.get("title"),
            "score": score,
            "snippet": snippet
        })
    return jsonify({"query": q, "count": len(out), "results": out})

@app.route("/api/doc/<doc_id>")
def api_doc(doc_id):
    d = docs.get(doc_id)
    if not d:
        return jsonify({"error":"not found"}), 404
    return jsonify(d)

# Serve static frontend if present
@app.route("/")
def index():
    return send_from_directory("static", "index.html")

if __name__ == "__main__":
    load_state()
    app.run(host="0.0.0.0", port=5000, debug=True)