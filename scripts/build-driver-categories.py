"""Build annual driver categories for drivers found in the four race catalogues.

Sources: Alkamel race classifications, FIA annual list CSV transcriptions linked
from mysuperlicence.com/drivers.php, and the existing supplied 2025/26 database.
Unknown means the annual category could not be verified by these sources.
"""
import csv
import io
import json
import re
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = json.loads((ROOT / "src/alkamel-catalogue.json").read_text(encoding="utf-8"))
HOSTS = {"ELMS": "elms.alkamelsystems.com", "WEC": "fiawec.alkamelsystems.com",
         "ALMS": "alms.alkamelsystems.com", "IMSA": "imsa.results.alkamelcloud.com"}
FULL = {"P": "Platinum", "G": "Gold", "S": "Silver", "B": "Bronze"}
ALIASES = {"alexanderquinn": "alexquinn", "benjaminhanley": "benhanley",
           "nicholasyelloly": "nickyelloly", "scotthuffakerii": "scotthuffaker",
           "horstfelbermayr": "horstfelbermayrjr"}


def key(name):
    name = name.casefold().replace("ı", "i")
    name = "".join(c for c in unicodedata.normalize("NFD", name)
                   if unicodedata.category(c) != "Mn")
    value = re.sub("[^a-z0-9]", "", name)
    return ALIASES.get(value, value)


def get_csv(url):
    for attempt in range(3):
        try:
            response = requests.get(url, timeout=25)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig", errors="replace")), delimiter=";", skipinitialspace=True))
        except requests.RequestException:
            if attempt == 2:
                return None
    return None


def url_for(race, classification=False):
    path = race["path"]
    if classification:
        if race["championship"] == "IMSA":
            path = re.sub(r"23_Time Cards_Race(?:_Unofficial)?\.CSV$", "03_Results_Race_Official.CSV", path, flags=re.I)
        else:
            path = path.replace("23_Analysis_Race", "03_Classification_Race")
    return "https://" + HOSTS[race["championship"]] + "/" + "/".join(quote(p, safe="") for p in path.split("/"))


def participants(race):
    url = url_for(race, True)
    rows = get_csv(url)
    if not rows:
        url = url_for(race)
        rows = get_csv(url)
    found = []
    for row in rows or []:
        row = {field.strip().upper().lstrip("\ufeff"): (value or "").strip()
               for field, value in row.items() if field}
        if "DRIVER_NAME" in row and row["DRIVER_NAME"]:
            found.append((row["DRIVER_NAME"], ""))
        for n in range(1, 7):
            name = row.get(f"DRIVER_{n}", "")
            if not name:
                name = " ".join(filter(None, [row.get(f"DRIVER{n}_FIRSTNAME", ""),
                                              row.get(f"DRIVER{n}_SECONDNAME", "")]))
            if name:
                found.append((name, row.get(f"DRIVER{n}_IMSA_DRIVERRATINGLONG", "")))
    return race, found, url


def fia_lists():
    lists = {}
    for year in range(2022, 2027):
        url = f"https://www.mysuperlicence.com/drivers.php?download_fia_csv={year}"
        response = requests.get(url, timeout=25)
        response.raise_for_status()
        text = response.content.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))
        if len(rows) < 1000 or rows[1][:2] != ["name", "category"]:
            raise RuntimeError(f"Unexpected FIA list format: {url}")
        values = defaultdict(set)
        for name, category, *_ in rows[2:]:
            if category in FULL and key(name):
                values[key(name)].add(category)
        lists[year] = {name: next(iter(cats)) for name, cats in values.items() if len(cats) == 1}
    return lists


def main():
    seen = {}
    missing = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        for race, names, source_url in as_completed_map(pool, participants, CATALOGUE):
            if not names:
                missing.append(race["id"])
            for name, rating in names:
                identity = key(name)
                if not identity:
                    continue
                record = seen.setdefault(identity, {"name": name, "years": defaultdict(set),
                                                    "ratings": defaultdict(set)})
                if name.casefold() < record["name"].casefold():
                    record["name"] = name
                record["years"][race["year"]].add(race["championship"])
                if rating.title() in FULL.values():
                    record["ratings"][race["year"]].add(rating.title())
    if missing:
        print(f"Warning: no drivers found in {len(missing)} races", missing[:10])
    annual = fia_lists()
    provided = defaultdict(dict)
    with (ROOT / "public/driver_categories_by_season.csv").open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            year = int(row["season"])
            category = row["fia_category"]
            if category in FULL:
                provided[year][key(row["driver_name_normalized"] or row["driver_name"])] = category
    output = ROOT / "public/driver_categories_all_series_2022_2026.csv"
    with output.open("w", encoding="utf-8", newline="") as file:
        fields = ["season", "driver_name", "driver_name_normalized", "fia_category", "fia_category_full",
                  "series", "source", "source_url", "participated"]
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        counts = defaultdict(int)
        for identity, record in sorted(seen.items(), key=lambda pair: pair[1]["name"].casefold()):
            for year in range(2022, 2027):
                category = annual[year].get(identity)
                source = ("FIA 2021 list used for 2022" if year == 2022 else "FIA annual list transcription") if category else ""
                source_url = f"https://www.mysuperlicence.com/drivers.php?download_fia_csv={year}" if category else ""
                if not category and len(record["ratings"][year]) == 1:
                    category = next(iter(record["ratings"][year]))[0]
                    source, source_url = "IMSA official race results", "https://imsa.results.alkamelcloud.com/"
                if not category and identity in provided[year]:
                    category = provided[year][identity]
                    source, source_url = "supplied category database", ""
                category = category or ""
                counts[year] += bool(category)
                writer.writerow({"season": year, "driver_name": record["name"],
                                 "driver_name_normalized": identity, "fia_category": category,
                                 "fia_category_full": FULL.get(category, "Unknown"),
                                 "series": "|".join(sorted(record["years"][year])),
                                 "source": source, "source_url": source_url,
                                 "participated": "yes" if record["years"][year] else "no"})
    print(f"Wrote {output}: {len(seen)} drivers, {len(seen) * 5} annual rows, ratings per year {dict(counts)}")


def as_completed_map(pool, fn, values):
    futures = [pool.submit(fn, value) for value in values]
    for future in as_completed(futures):
        yield future.result()


if __name__ == "__main__":
    main()
