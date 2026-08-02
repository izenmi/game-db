#!/usr/bin/env python3
"""汎用バッチ反映スクリプト。
使い方: python3 scripts/apply_batch.py <batch.json>

batch.json の形式:
{
  "newCompanies": [...],
  "newGenres": [...],
  "newAwards": [...],
  "games": [...]
}

- 新規id(company/genre/award)は既存と重複していればスキップ
- game は developerIds/publisherId/genreIds/awardResults[].awardId が
  (既存 + このバッチで追加される新規id) の中に存在するか検証し、
  存在しない参照があればそのgame自体を反映せずレポートする
- developerIds が空配列、platforms が空配列または未知の値を含む場合も反映せずレポートする
- 既存game idと重複するgameはスキップ
"""
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "public" / "data" / "source"
PLATFORMS = {"ps5", "switch", "switch2"}

def load(name):
    with open(SRC / f"{name}.json", encoding="utf-8") as f:
        return json.load(f)

def save(name, data):
    with open(SRC / f"{name}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

def main():
    if len(sys.argv) != 2:
        print("usage: apply_batch.py <batch.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        batch = json.load(f)

    companies = load("companies")
    genres = load("genres")
    awards = load("awards")
    games = load("games")

    company_ids = {c["id"] for c in companies}
    genre_ids = {g["id"] for g in genres}
    award_ids = {a["id"] for a in awards}
    game_ids = {g["id"] for g in games}

    report = {"added": {}, "skipped_duplicates": {}, "rejected_games": []}

    def add_new(pool, id_set, key_name, kind):
        added, skipped = [], []
        for item in batch.get(key_name, []):
            if item["id"] in id_set:
                skipped.append(item["id"])
            else:
                pool.append(item)
                id_set.add(item["id"])
                added.append(item["id"])
        report["added"][kind] = added
        report["skipped_duplicates"][kind] = skipped

    add_new(companies, company_ids, "newCompanies", "companies")
    add_new(genres, genre_ids, "newGenres", "genres")
    add_new(awards, award_ids, "newAwards", "awards")

    added_games = []
    for g in batch.get("games", []):
        if g["id"] in game_ids:
            report["rejected_games"].append({"id": g["id"], "reason": "duplicate game id"})
            continue

        missing = []
        developer_ids = g.get("developerIds", [])
        if not developer_ids:
            missing.append("developerIds: must have at least one entry")
        for did in developer_ids:
            if did not in company_ids:
                missing.append(f"developerId:{did}")
        pid = g.get("publisherId")
        if pid and pid not in company_ids:
            missing.append(f"publisherId:{pid}")
        platforms = g.get("platforms", [])
        if not platforms:
            missing.append("platforms: must have at least one entry")
        for p in platforms:
            if p not in PLATFORMS:
                missing.append(f"unknown platform:{p}")
        for gid in g.get("genreIds", []):
            if gid not in genre_ids:
                missing.append(f"genreId:{gid}")
        for ar in g.get("awardResults", []):
            if ar.get("awardId") not in award_ids:
                missing.append(f"awardId:{ar.get('awardId')}")

        if missing:
            report["rejected_games"].append({"id": g["id"], "reason": f"missing refs: {missing}"})
            continue

        games.append(g)
        game_ids.add(g["id"])
        added_games.append(g["id"])

    report["added"]["games"] = added_games

    save("companies", companies)
    save("genres", genres)
    save("awards", awards)
    save("games", games)

    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
