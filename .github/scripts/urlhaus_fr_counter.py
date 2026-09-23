#!/usr/bin/env python3
"""Compteur « menaces actives en France » à partir du flux pays d'abuse.ch URLhaus.

Mesure : nombre d'URL de distribution de malware au statut « online »
dont le serveur est géolocalisé en France (flux pays FR de URLhaus).
Ce n'est PAS un nombre d'attaques.

Sortie : JSON sur stdout. En cas d'échec, le JSON contient "ok": false
(le site affiche alors « Données indisponibles ») et le script sort en 0
pour que l'état « indisponible » soit tout de même publié.

Variables d'environnement :
  URLHAUS_AUTH_KEY  clé gratuite à créer sur https://auth.abuse.ch/
"""
import csv
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

FEED_URL = "https://urlhaus.abuse.ch/feeds/country/FR/"
USER_AGENT = "MGC-site-threat-counter/1.0 (+https://www.mgc-paris.fr)"
SOURCE = {
    "source": "abuse.ch URLhaus",
    "sourceUrl": "https://urlhaus.abuse.ch/",
    "license": "CC0",
    "metric": "urlhaus_fr_online_urls",
    # Le flux est régénéré toutes les 5 à 10 min et relu toutes les 15 min :
    # ce n'est pas du temps réel, le site n'affichera donc pas « en direct ».
    "realtime": False,
}


def iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(key):
    req = urllib.request.Request(FEED_URL, headers={"Auth-Key": key, "User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read().decode("utf-8", "replace")


def parse(text, now):
    """Retourne (urls_online, ajoutees_24h, total_lignes)."""
    header = None
    rows = []
    for line in text.splitlines():
        if line.startswith("#"):
            cols = [c.strip().lower() for c in next(csv.reader([line.lstrip("#").strip()]))]
            if cols and cols[0].startswith("dateadded"):
                header = cols
            continue
        if line.strip():
            rows.append(line)

    if not header or "url_status" not in header:
        raise ValueError("format_inattendu")
    if not rows:
        raise ValueError("flux_vide")

    i_status = header.index("url_status")
    i_date = 0
    i_country = header.index("country") if "country" in header else None
    since = now - timedelta(hours=24)

    online = added_24h = 0
    for row in csv.reader(rows):
        if len(row) <= i_status:
            continue
        if i_country is not None and len(row) > i_country and row[i_country].strip().upper() != "FR":
            continue
        if row[i_status].strip().lower() == "online":
            online += 1
        try:
            added = datetime.strptime(row[i_date].strip(), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            if added >= since:
                added_24h += 1
        except ValueError:
            pass
    return online, added_24h, len(rows)


def main():
    now = datetime.now(timezone.utc)
    out = {"updatedAt": iso(now), **SOURCE}
    key = os.environ.get("URLHAUS_AUTH_KEY", "").strip()
    try:
        if not key:
            raise ValueError("cle_absente")
        online, added_24h, total = parse(fetch(key), now)
        out.update(ok=True, value=online, added24h=added_24h, totalRows=total)
    except urllib.error.HTTPError as err:
        out.update(ok=False, error=f"http_{err.code}")
    except (urllib.error.URLError, TimeoutError, OSError):
        out.update(ok=False, error="reseau")
    except ValueError as err:
        out.update(ok=False, error=str(err))
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
