#!/usr/bin/env python3
"""suggest-candidates.mjs / verify-candidates.mjs の出力 + 手書きの注釈TSV から
apply_batch.py 用の batch.json を組み立てる(game-db版)。

  IGDB行(cand.tsv、1行1本、suggest-candidates.mjsの出力をそのまま使える):
    <IGDB名> | <platforms> | <発売日> | D:<開発> | P:<発売> | G:<IGDBジャンル>

  anno.tsv(1行1本、タブ区切り):
    <n> <日本語タイトル> <よみ> <genreIds(カンマ区切り)> <あらすじ> [<awards>]
      awards … 「awardId:年:結果」をカンマ区切り(例 the-game-awards:2015:ゲーム・オブ・ザ・イヤー)

会社名は companies.json と英日どちらの表記でも突き合わせ、無ければ新規idを採番する。
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "public" / "data" / "source"
TODAY = "2026-08-07"
SOURCE_NOTE = ("IGDB(2026-08-07照会)で対応機種・発売日・開発/発売元を確認。受賞歴はWikipedia日本語版の"
               "各賞の受賞作一覧で確認。あらすじは独自要約(コピペなし)。")

DROP = re.compile(r"[\s　・,，.。!！?？:：;；'\"’”“‘()（）\[\]【】/／\\|\-−–—~〜]")


def norm(s):
    return DROP.sub("", unicodedata.normalize("NFKC", s or "").lower())


def load(name):
    return json.load(open(SRC / f"{name}.json", encoding="utf-8"))


def main():
    cand_path, anno_path, out_path = sys.argv[1:4]
    companies, genres, games = load("companies"), load("genres"), load("games")
    by_name = {}
    for c in companies:
        by_name[norm(c["name"])] = c["id"]
        by_name.setdefault(norm(c["id"].replace("-", "")), c["id"])
    genre_ids = {g["id"] for g in genres}
    game_ids = {g["id"] for g in games}
    company_ids = {c["id"] for c in companies}
    game_titles = {norm(g["title"]) for g in games}

    rows = []
    for ln in open(cand_path, encoding="utf-8"):
        ln = ln.strip()
        if "|" not in ln:
            continue
        parts = [p.strip() for p in ln.split("|")]
        rec = {"igdb": parts[0], "platforms": parts[1].split(","), "date": parts[2]}
        for p in parts[3:]:
            if p.startswith("D:"):
                rec["dev"] = [x.strip() for x in p[2:].split(";") if x.strip()]
            elif p.startswith("P:"):
                rec["pub"] = [x.strip() for x in p[2:].split(";") if x.strip()]
        rows.append(rec)

    new_companies, out_games, problems = [], [], []

    def company_id(name):
        key = norm(name)
        if key in by_name:
            return by_name[key]
        cid = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48] or "company"
        base, i = cid, 2
        while cid in company_ids:
            cid = f"{base}-{i}"
            i += 1
        company_ids.add(cid)
        new_companies.append({"id": cid, "name": name, "nameKana": name,
                              "description": "ゲームの開発・発売を手がける企業。",
                              "externalLinks": {},
                              "sourceNote": f"IGDBの登録情報で確認({TODAY})。", "updatedAt": TODAY})
        by_name[key] = cid
        return cid

    for ln in open(anno_path, encoding="utf-8"):
        ln = ln.rstrip("\n")
        if not ln.strip() or ln.startswith("#"):
            continue
        f = ln.split("\t")
        n = int(f[0])
        title, kana = f[1], f[2]
        genre_str = f[3] if len(f) > 3 else ""
        synopsis = f[4] if len(f) > 4 else ""
        awards_str = f[5] if len(f) > 5 else ""
        if n >= len(rows):
            problems.append(f"n={n} 候補行なし")
            continue
        r = rows[n]
        if norm(title) in game_titles:
            problems.append(f"n={n} {title}: 既にgames.jsonにある")
            continue
        gid = re.sub(r"[^a-z0-9]+", "-", r["igdb"].lower()).strip("-")[:48]
        base, i = gid, 2
        while gid in game_ids:
            gid = f"{base}-{i}"
            i += 1
        game_ids.add(gid)

        gl = [g.strip() for g in genre_str.split(",") if g.strip()]
        bad = [g for g in gl if g not in genre_ids]
        if bad:
            problems.append(f"n={n} {title}: 未知のジャンルid {bad}")
            continue

        awards = []
        for a in awards_str.split(","):
            a = a.strip()
            if not a:
                continue
            p = a.split(":")
            if len(p) == 3:
                awards.append({"awardId": p[0], "year": int(p[1]), "result": p[2]})

        out_games.append({
            "id": gid, "title": title, "titleKana": kana,
            "developerIds": [company_id(x) for x in r.get("dev", [])[:2]],
            "publisherId": company_id(r.get("pub", ["不明"])[0]),
            "platforms": r["platforms"], "genreIds": gl,
            "releaseDate": r["date"], "synopsis": synopsis,
            "awardResults": awards, "externalLinks": {},
            "sourceNote": SOURCE_NOTE, "updatedAt": TODAY,
        })

    batch = {"newCompanies": new_companies, "newGenres": [], "newAwards": [], "games": out_games}
    Path(out_path).write_text(json.dumps(batch, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"games={len(out_games)} newCompanies={len(new_companies)}")
    for p in problems:
        print("! " + p)


if __name__ == "__main__":
    main()
