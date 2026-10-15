#!/usr/bin/env python3
"""Construction du site web et des packages SCORM 1.2 à partir de la source unique.

Usage : python3 scripts/construire.py
Produit :
  index.html + contenus/contenu.js  site web (racine du dépôt, publiable tel quel par GitHub Pages)
  exports/module-XX-<titre>-scorm12.zip  un package SCORM autonome par module disponible
  dist/scorm/<module>/              contenu décompressé de chaque package (pour le simulateur)
  dist/simulateur/                  simulateur d'API SCORM 1.2 pour les tests
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree
from xml.sax.saxutils import escape, quoteattr

sys.path.insert(0, str(Path(__file__).resolve().parent))
import valider_contenus  # noqa: E402
import valider_tutorat  # noqa: E402

RACINE = valider_contenus.RACINE
SRC = RACINE / "src"
DIST = RACINE / "dist"
EXPORTS = RACINE / "exports"
SIMULATEUR = RACINE / "outils" / "simulateur-scorm"


def ecrire(chemin, texte):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(texte, encoding="utf-8")


def copier_moteur(destination):
    shutil.copytree(SRC / "js", destination / "assets" / "js")
    shutil.copytree(SRC / "css", destination / "assets" / "css")
    if (SRC / "medias").exists():
        shutil.copytree(SRC / "medias", destination / "assets" / "medias")


def empreinte_sources():
    h = hashlib.sha1()
    for p in sorted(SRC.rglob("*")) + sorted((RACINE / "contenus").rglob("*.json")):
        if p.is_file():
            h.update(p.read_bytes())
    return h.hexdigest()[:10]


def page_index(catalogue, config, titre, empreinte, base, contenu):
    gabarit = (SRC / "index.html").read_text(encoding="utf-8")
    gabarit = gabarit.replace("{{BASE}}", base).replace("{{CONTENU}}", contenu)
    # Évite qu'un navigateur ou un LMS serve une ancienne version en cache.
    gabarit = re.sub(r'((?:src|href)="(?!#|https?:)[^"?]+)"', r'\1?v=' + empreinte + '"', gabarit)
    valeurs = {
        "TITRE": escape(titre),
        "INSTITUTION": escape(catalogue["institution"]),
        "SOUS_TITRE": escape(catalogue["sousTitre"]),
        "VERSION": escape(catalogue["version"]),
        "CONFIG": json.dumps(config, ensure_ascii=False),
    }
    for cle, val in valeurs.items():
        gabarit = gabarit.replace("{{" + cle + "}}", val)
    return gabarit


def fichier_contenu(catalogue, modules):
    tutorat = json.loads((RACINE / "contenus" / "tutorat.json").read_text(encoding="utf-8"))
    objectifs = {o["id"] for m in modules.values() for o in m["objectifsSpecifiques"]}
    tutorat["objectifs"] = {k: v for k, v in tutorat["objectifs"].items() if k in objectifs}
    donnees = {"catalogue": catalogue, "modules": modules, "tutorat": tutorat}
    return "window.GDD_CONTENU = " + json.dumps(donnees, ensure_ascii=False, separators=(",", ":")) + ";\n"


def verifier_references(dossier):
    """Vérifie que chaque fichier référencé dans index.html est présent dans le dossier."""
    html = (dossier / "index.html").read_text(encoding="utf-8")
    manquants = []
    for ref in re.findall(r'(?:src|href)="([^"#:?]+)', html):
        if not (dossier / ref).is_file():
            manquants.append(ref)
    return manquants


def manifeste(catalogue, module, fichiers):
    mid = module["id"].upper()
    seuil = module.get("validation", {}).get("seuilReussite")
    titre = f"Module {module['numero']} - {module['titre']}"
    lignes_fichiers = "\n".join(f"      <file href={quoteattr(f)}/>" for f in fichiers)
    maitrise = (
        f"\n        <adlcp:masteryscore>{int(seuil)}</adlcp:masteryscore>"
        if module.get("validation", {}).get("evaluation") and seuil is not None else ""
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="UPS-GDD-{mid}" version="{escape(catalogue['version'])}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-{mid}">
    <organization identifier="ORG-{mid}">
      <title>{escape(titre)}</title>
      <item identifier="ITEM-{mid}" identifierref="RES-{mid}" isvisible="true">
        <title>{escape(titre)}</title>{maitrise}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-{mid}" type="webcontent" adlcp:scormtype="sco" href="index.html">
{lignes_fichiers}
    </resource>
  </resources>
</manifest>
"""


def lister_fichiers(dossier):
    return sorted(p.relative_to(dossier).as_posix() for p in dossier.rglob("*") if p.is_file())


def verifier_xml(chemin):
    if shutil.which("xmllint") is None:
        try:
            ElementTree.parse(chemin)
            return True, "XML bien formé"
        except ElementTree.ParseError as e:
            return False, str(e)
    res = subprocess.run(["xmllint", "--noout", str(chemin)], capture_output=True, text=True)
    return res.returncode == 0, res.stderr.strip() or "XML bien formé"


def zipper(dossier, archive):
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.exists():
        archive.unlink()
    # Le manifeste doit être à la racine de l'archive. Dates fixes : l'archive ne change
    # que si son contenu change (évite des modifications inutiles dans git).
    noms = ["imsmanifest.xml"] + [f for f in lister_fichiers(dossier) if f != "imsmanifest.xml"]
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for f in noms:
            info = zipfile.ZipInfo(f, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, (dossier / f).read_bytes())


def nom_archive(module):
    """module-02-une-donnee-plusieurs-usages-scorm12.zip"""
    sans_accents = unicodedata.normalize("NFKD", module["titre"]).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", sans_accents.lower()).strip("-")
    return f"module-{int(module['numero']):02d}-{slug}-scorm12.zip"


def construire():
    print("1. Validation des contenus")
    catalogue, modules, rapport = valider_contenus.valider()
    valider_contenus.afficher_rapport(rapport)
    if rapport.erreurs:
        print("Construction interrompue : corriger les erreurs ci-dessus.")
        return 1

    erreurs_tuteur = valider_tutorat.valider(modules)
    if erreurs_tuteur:
        for erreur in erreurs_tuteur:
            print(f"Tutorat : {erreur}")
        return 1

    if DIST.exists():
        shutil.rmtree(DIST)
    problemes = []
    empreinte = empreinte_sources()

    print("2. Site web -> index.html (racine) + contenus/contenu.js")
    ecrire(RACINE / "contenus" / "contenu.js", fichier_contenu(catalogue, modules))
    config_web = {"mode": "web", "exports": {mid: "exports/" + nom_archive(m) for mid, m in modules.items()}}
    ecrire(RACINE / "index.html", page_index(catalogue, config_web, catalogue["titre"], empreinte,
                                             "src/", "contenus/contenu.js"))
    problemes += [f"site : ressource manquante {m}" for m in verifier_references(RACINE)]

    print("3. Packages SCORM 1.2 -> exports/")
    EXPORTS.mkdir(exist_ok=True)
    attendus = {nom_archive(m) for m in modules.values()}
    for perime in EXPORTS.glob("*.zip"):
        if perime.name not in attendus:
            perime.unlink()
            print(f"   ancien package supprimé : {perime.relative_to(RACINE)}")
    for mid, module in modules.items():
        dossier = DIST / "scorm" / mid
        copier_moteur(dossier)
        ecrire(dossier / "assets" / "js" / "contenu.js", fichier_contenu(catalogue, {mid: module}))
        titre = f"Module {module['numero']} - {module['titre']}"
        ecrire(dossier / "index.html", page_index(catalogue, {"mode": "scorm", "module": mid}, titre, empreinte,
                                                  "assets/", "assets/js/contenu.js"))
        fichiers = lister_fichiers(dossier)
        ecrire(dossier / "imsmanifest.xml", manifeste(catalogue, module, fichiers))
        ok, msg = verifier_xml(dossier / "imsmanifest.xml")
        if not ok:
            problemes.append(f"{mid} : manifeste invalide : {msg}")
        problemes += [f"{mid} : ressource manquante {m}" for m in verifier_references(dossier)]
        archive = EXPORTS / nom_archive(module)
        zipper(dossier, archive)
        print(f"   {archive.relative_to(RACINE)} ({len(fichiers) + 1} fichiers, {archive.stat().st_size // 1024} Ko) - {msg}")

    print("4. Simulateur SCORM -> dist/simulateur/")
    shutil.copytree(SIMULATEUR, DIST / "simulateur")
    ecrire(DIST / "simulateur" / "packages.js",
           "window.PACKAGES = " + json.dumps(
               [{"id": mid, "titre": f"Module {m['numero']} - {m['titre']}", "url": f"../scorm/{mid}/index.html"}
                for mid, m in modules.items()], ensure_ascii=False) + ";\n")

    if problemes:
        print("Problèmes détectés :")
        for p in problemes:
            print(f"  ✗ {p}")
        return 1
    print("Construction terminée sans erreur.")
    return 0


if __name__ == "__main__":
    sys.exit(construire())
