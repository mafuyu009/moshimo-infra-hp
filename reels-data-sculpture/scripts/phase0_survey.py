#!/usr/bin/env python3
"""Phase 0 survey: count public-domain Japanese scenic/tourism posters by source, region and year.

Read-only survey. Downloads NO images; it lists candidates and their metadata so you can judge
counts, gaps and PD basis before any bulk fetch. Python 3.9+, standard library only.

  python3 phase0_survey.py                    # writes to ./data/phase0/
  python3 phase0_survey.py --out data/phase0 --max-commons 3000 --max-ndl 1000

Outputs
  candidates.csv   one row per candidate (the ledger format used later for the real fetch)
  summary.md       counts by source / region / decade / PD status, and the gaps
  log.txt          what was queried and what failed

IMPORTANT
- REGIONS below is a placeholder. Replace it with the 10-region definition in
  claude-code-instructions.md before trusting the region table.
- pd_status "pd_confirmed" only means the source states PD (a Commons PD licence template,
  or an NDL rights statement that says protection expired). Every row still needs a human
  check before Phase 1; rows marked "needs_review" must not be used as-is.
"""
import argparse, csv, json, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

UA = "reels-data-sculpture-phase0/0.1 (non-commercial research survey)"

# ---------------------------------------------------------------- regions (PLACEHOLDER: replace)
REGIONS = {
    "北海道": ["北海道", "Hokkaido", "札幌", "Sapporo", "函館", "Hakodate", "小樽", "阿寒", "Akan", "大雪", "洞爺", "支笏", "登別"],
    "東北": ["青森", "Aomori", "岩手", "Iwate", "宮城", "Miyagi", "松島", "Matsushima", "秋田", "Akita", "山形", "Yamagata", "福島", "Fukushima", "十和田", "Towada", "磐梯", "Bandai", "仙台", "Sendai", "平泉"],
    "関東": ["東京", "Tokyo", "神奈川", "横浜", "Yokohama", "鎌倉", "Kamakura", "箱根", "Hakone", "日光", "Nikko", "栃木", "群馬", "埼玉", "千葉", "茨城", "江ノ島", "Enoshima"],
    "中部": ["富士", "Fuji", "山梨", "長野", "Nagano", "上高地", "Kamikochi", "軽井沢", "Karuizawa", "新潟", "Niigata", "佐渡", "富山", "石川", "金沢", "Kanazawa", "福井", "岐阜", "Gifu", "静岡", "Shizuoka", "愛知", "名古屋", "Nagoya", "伊豆", "Izu", "日本アルプス", "Japan Alps"],
    "近畿": ["京都", "Kyoto", "奈良", "Nara", "大阪", "Osaka", "兵庫", "神戸", "Kobe", "姫路", "Himeji", "滋賀", "琵琶湖", "Biwa", "三重", "伊勢", "Ise", "和歌山", "高野", "Koya", "吉野", "Yoshino", "天橋立"],
    "中国": ["広島", "Hiroshima", "宮島", "Miyajima", "厳島", "Itsukushima", "岡山", "Okayama", "鳥取", "島根", "出雲", "Izumo", "山口", "秋吉台"],
    "四国": ["香川", "高松", "屋島", "徳島", "鳴門", "Naruto", "愛媛", "松山", "道後", "高知", "Kochi", "四国", "Shikoku"],
    "九州": ["福岡", "Fukuoka", "長崎", "Nagasaki", "雲仙", "Unzen", "熊本", "阿蘇", "Aso", "大分", "別府", "Beppu", "宮崎", "鹿児島", "Kagoshima", "霧島", "Kirishima", "佐賀", "九州", "Kyushu"],
    "沖縄": ["沖縄", "Okinawa", "琉球", "Ryukyu"],
    "全国・複数地域": ["日本", "Japan", "Nippon", "瀬戸内", "Inland Sea"],
}

# ---------------------------------------------------------------- sources
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
# Seed categories: the script reports which exist. Add/remove after the first run.
COMMONS_SEEDS = [
    "Category:Tourism posters of Japan",
    "Category:Travel posters of Japan",
    "Category:Japan Tourist Bureau",
    "Category:Board of Tourist Industry (Japan)",
    "Category:Posters of Japan",
    "Category:Railway posters of Japan",
    "Category:Japanese Government Railways",
    "Category:Shin-hanga",          # many travel prints; mark separately, not posters
]
COMMONS_SEARCH = ['"tourist poster" Japan', '"travel poster" Japan', "観光ポスター", "鉄道省 ポスター", "Japan Tourist Bureau poster"]
COMMONS_MAX_DEPTH = 2

NDL_OPENSEARCH = "https://ndlsearch.ndl.go.jp/api/opensearch"
NDL_QUERIES = ["観光ポスター", "ポスター 鉄道省", "ポスター 名所", "ポスター 国立公園", "ポスター 温泉", "ポスター 観光", "ジャパン・ツーリスト・ビューロー ポスター"]

PD_LICENSE_RE = re.compile(r"(public domain|^pd[- ]|cc0)", re.I)
ERA = {"明治": 1867, "大正": 1911, "昭和": 1925}

log_lines = []
def log(msg):
    print(msg, file=sys.stderr); log_lines.append(msg)

def get(url, params=None, tries=4):
    if params: url = url + "?" + urllib.parse.urlencode(params)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception as e:
            wait = 2 ** k
            log(f"  retry {k+1}/{tries} in {wait}s: {e} :: {url[:140]}")
            time.sleep(wait)
    log(f"  FAILED: {url[:160]}")
    return None

def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()

def guess_year(*texts):
    t = " ".join(x for x in texts if x)
    for era, base in ERA.items():
        m = re.search(era + r"\s*(\d{1,2}|元)\s*年", t)
        if m:
            n = 1 if m.group(1) == "元" else int(m.group(1))
            return base + n
    m = re.search(r"\b(18[6-9]\d|19[0-7]\d)\b", t)
    return int(m.group(1)) if m else None

def guess_region(*texts):
    t = " ".join(x for x in texts if x)
    hits = [(name, kw) for name, kws in REGIONS.items() if name != "全国・複数地域" for kw in kws if kw.lower() in t.lower()]
    names = sorted({h[0] for h in hits})
    if len(names) == 1: return names[0], hits[0][1]
    if len(names) > 1: return "複数候補:" + "/".join(names), ",".join(h[1] for h in hits[:4])
    for kw in REGIONS["全国・複数地域"]:
        if kw.lower() in t.lower(): return "全国・複数地域", kw
    return "不明", ""

# ---------------------------------------------------------------- Wikimedia Commons
def commons_files_in(cat, depth, seen_cats, files):
    if cat in seen_cats or depth < 0: return
    seen_cats.add(cat)
    cont = {}
    while True:
        p = {"action": "query", "list": "categorymembers", "cmtitle": cat, "cmlimit": "500",
             "cmtype": "file|subcat", "format": "json", **cont}
        raw = get(COMMONS_API, p)
        if not raw: return
        d = json.loads(raw)
        if "error" in d: log(f"  commons error {cat}: {d['error']}"); return
        for m in d.get("query", {}).get("categorymembers", []):
            if m["ns"] == 6: files.setdefault(m["title"], cat)
            elif m["ns"] == 14: commons_files_in(m["title"], depth - 1, seen_cats, files)
        if "continue" not in d: return
        cont = d["continue"]

def commons_search(q, files, limit=500):
    cont = {}
    got = 0
    while got < limit:
        p = {"action": "query", "list": "search", "srsearch": q, "srnamespace": "6", "srlimit": "50", "format": "json", **cont}
        raw = get(COMMONS_API, p)
        if not raw: return
        d = json.loads(raw)
        for m in d.get("query", {}).get("search", []):
            files.setdefault(m["title"], f"search:{q}"); got += 1
        if "continue" not in d: return
        cont = d["continue"]

def commons_meta(titles):
    out = {}
    for i in range(0, len(titles), 50):
        p = {"action": "query", "titles": "|".join(titles[i:i + 50]), "prop": "imageinfo|categories",
             "iiprop": "url|extmetadata|size|mime", "cllimit": "max", "format": "json"}
        raw = get(COMMONS_API, p)
        if not raw: continue
        for pg in json.loads(raw).get("query", {}).get("pages", {}).values():
            ii = (pg.get("imageinfo") or [{}])[0]
            em = {k: v.get("value") for k, v in (ii.get("extmetadata") or {}).items()}
            out[pg["title"]] = {"ii": ii, "em": em, "cats": [c["title"] for c in pg.get("categories", [])]}
        time.sleep(0.2)
    return out

def survey_commons(maxn):
    files, seen = {}, set()
    for seed in COMMONS_SEEDS:
        before = len(files)
        commons_files_in(seed, COMMONS_MAX_DEPTH, seen, files)
        log(f"commons seed {seed}: +{len(files) - before} files")
    for q in COMMONS_SEARCH:
        before = len(files); commons_search(q, files)
        log(f"commons search {q!r}: +{len(files) - before} files")
    titles = list(files)[:maxn]
    meta = commons_meta(titles)
    rows = []
    for t in titles:
        m = meta.get(t, {}); em = m.get("em", {}); ii = m.get("ii", {})
        title = t.removeprefix("File:")
        desc = strip_html(em.get("ImageDescription", ""))
        lic = strip_html(em.get("LicenseShortName", "")) or strip_html(em.get("License", ""))
        cats = m.get("cats", [])
        pd_cats = [c for c in cats if re.search(r"PD[- ]|public domain", c, re.I)]
        is_pd = bool(PD_LICENSE_RE.search(lic)) or bool(pd_cats)
        date = strip_html(em.get("DateTimeOriginal", ""))
        year = guess_year(date, title, desc)
        region, kw = guess_region(title, desc, " ".join(cats))
        poster_like = bool(re.search(r"poster|ポスター", title + desc + " ".join(cats), re.I))
        rows.append({
            "source": "wikimedia_commons", "source_id": t, "title": title[:200],
            "place_keyword": kw, "region_guess": region, "year_guess": year or "",
            "date_raw": date[:80], "publisher": strip_html(em.get("Artist", ""))[:120],
            "license": lic[:80], "pd_basis": "; ".join(pd_cats)[:200] or lic[:80],
            "pd_status": "pd_confirmed" if is_pd else "needs_review",
            "is_poster": "yes" if poster_like else "check",
            "page_url": ii.get("descriptionurl", ""), "file_url": ii.get("url", ""),
            "width": ii.get("width", ""), "height": ii.get("height", ""),
            "found_via": files[t], "notes": "",
        })
    return rows

# ---------------------------------------------------------------- NDL Search (OpenSearch / RSS)
def survey_ndl(maxn):
    rows, seen = [], set()
    ns = {"dc": "http://purl.org/dc/elements/1.1/", "dcndl": "http://ndl.go.jp/dcndl/terms/",
          "dcterms": "http://purl.org/dc/terms/", "rdfs": "http://www.w3.org/2000/01/rdf-schema#"}
    for q in NDL_QUERIES:
        start, added = 1, 0
        while len(rows) < maxn:
            raw = get(NDL_OPENSEARCH, {"any": q, "cnt": "200", "idx": str(start), "mediatype": "digital"})
            if not raw: break
            try: root = ET.fromstring(raw)
            except ET.ParseError as e: log(f"  ndl parse error {q}: {e}"); break
            items = root.findall(".//item")
            if not items: break
            for it in items:
                link = (it.findtext("link") or "").strip()
                if not link or link in seen: continue
                seen.add(link)
                title = (it.findtext("title") or "").strip()
                desc = strip_html(it.findtext("description") or "")
                pub = " ".join(x.text or "" for x in it.findall("dc:publisher", ns))
                date = " ".join(x.text or "" for x in it.findall("dcterms:issued", ns) + it.findall("dc:date", ns))
                seeAlso = [x.get("{http://www.w3.org/1999/02/22-rdf-syntax-ns#}resource", "") for x in it.findall("rdfs:seeAlso", ns)]
                dl = next((s for s in seeAlso if "dl.ndl.go.jp" in s), "")
                region, kw = guess_region(title, desc)
                rows.append({
                    "source": "ndl", "source_id": link, "title": title[:200], "place_keyword": kw,
                    "region_guess": region, "year_guess": guess_year(date, title) or "", "date_raw": date[:80],
                    "publisher": pub[:120], "license": "",
                    # NDL rights are shown on the dl.ndl.go.jp item page ("保護期間満了" / "インターネット公開").
                    # The OpenSearch feed does not state them, so every NDL row starts as needs_review.
                    "pd_basis": "", "pd_status": "needs_review",
                    "is_poster": "yes" if "ポスター" in title + desc else "check",
                    "page_url": dl or link, "file_url": "", "width": "", "height": "",
                    "found_via": f"ndl:{q}", "notes": "NDL権利表示を dl.ndl.go.jp で要確認",
                })
                added += 1
            start += len(items)
            time.sleep(0.5)
        log(f"ndl query {q!r}: +{added} items")
    return rows

# ---------------------------------------------------------------- report
FIELDS = ["source", "source_id", "title", "place_keyword", "region_guess", "year_guess", "date_raw", "publisher",
          "license", "pd_basis", "pd_status", "is_poster", "page_url", "file_url", "width", "height", "found_via", "notes"]

def decade(y):
    try: return f"{int(y) // 10 * 10}s"
    except (TypeError, ValueError): return "不明"

def summarize(rows, out):
    L = ["# Phase 0 survey summary", "", f"candidates: {len(rows)}", ""]
    def table(title, key, filt=lambda r: True):
        L.append(f"## {title}"); L.append("")
        sub = [r for r in rows if filt(r)]
        by = defaultdict(Counter)
        for r in sub: by[key(r)][r["pd_status"]] += 1
        L.append("| key | pd_confirmed | needs_review | total |"); L.append("|---|---|---|---|")
        for k in sorted(by, key=str):
            c = by[k]; L.append(f"| {k} | {c['pd_confirmed']} | {c['needs_review']} | {sum(c.values())} |")
        L.append("")
    table("By source", lambda r: r["source"])
    table("By source x poster-like", lambda r: f"{r['source']} / poster={r['is_poster']}")
    poster_pd = lambda r: r["pd_status"] == "pd_confirmed" and r["is_poster"] == "yes"
    table("By region (PD-confirmed posters only)", lambda r: r["region_guess"], poster_pd)
    table("By decade (PD-confirmed posters only)", lambda r: decade(r["year_guess"]), poster_pd)
    reg = Counter(r["region_guess"] for r in rows if poster_pd(r))
    thin = [k for k in REGIONS if reg.get(k, 0) < 20]
    L += ["## Gaps", "", "regions with < 20 PD-confirmed posters: " + (", ".join(thin) or "none"), "",
          "NDL rows are all needs_review until the rights statement on each dl.ndl.go.jp page is checked.", ""]
    (out / "summary.md").write_text("\n".join(L), encoding="utf-8")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/phase0")
    ap.add_argument("--max-commons", type=int, default=3000)
    ap.add_argument("--max-ndl", type=int, default=1000)
    ap.add_argument("--skip", choices=["commons", "ndl"], action="append", default=[])
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rows = []
    if "commons" not in a.skip: rows += survey_commons(a.max_commons)
    if "ndl" not in a.skip: rows += survey_ndl(a.max_ndl)
    with open(out / "candidates.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(rows)
    summarize(rows, out)
    (out / "log.txt").write_text("\n".join(log_lines), encoding="utf-8")
    print(f"{len(rows)} candidates -> {out}/candidates.csv, summary.md", file=sys.stderr)

if __name__ == "__main__":
    main()
