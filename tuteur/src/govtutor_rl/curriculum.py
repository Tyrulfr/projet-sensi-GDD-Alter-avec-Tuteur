"""Curriculum et mini-banque de questions pédagogiques (contenu synthétique)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Question:
    prompt: str
    options: tuple[str, str, str]
    correct: int
    explanation: str


@dataclass(frozen=True)
class Skill:
    key: str
    title: str
    concept: str
    example: str
    prerequisite: tuple[str, ...]
    questions: tuple[Question, ...]


SKILLS: tuple[Skill, ...] = (
    Skill(
        "strategy", "Stratégie de gouvernance",
        "La gouvernance définit les droits de décision, les responsabilités, les politiques et les mécanismes de contrôle sur les données.",
        "Une entreprise fixe des objectifs de qualité, attribue des responsabilités et suit des indicateurs de conformité.",
        (), (
            Question("Quel élément relève directement de la gouvernance des données ?", ("Choisir le langage de programmation", "Définir les responsabilités et les décisions sur les données", "Augmenter la RAM des serveurs"), 1, "La gouvernance précise qui décide, selon quelles règles, et comment les résultats sont suivis."),
            Question("Pourquoi relier la gouvernance aux objectifs métiers ?", ("Pour hiérarchiser les risques et priorités", "Pour supprimer tout contrôle qualité", "Pour remplacer les équipes métiers"), 0, "La gouvernance doit servir des objectifs et risques concrets de l'organisation."),
        ),
    ),
    Skill(
        "roles", "Rôles : owner et steward",
        "Le data owner porte la responsabilité métier et l'arbitrage ; le data steward anime les définitions et la qualité au quotidien.",
        "Le responsable du domaine Clients valide une règle de partage ; le steward suit la correction des anomalies de données.",
        ("strategy",), (
            Question("Qui valide en principe une règle métier de partage sur son domaine ?", ("Data owner", "Administrateur réseau uniquement", "Utilisateur anonyme"), 0, "Le data owner est responsable des arbitrages métier sur le domaine attribué."),
            Question("Quelle activité correspond généralement au data steward ?", ("Définir seul la stratégie de l'entreprise", "Suivre la qualité et la documentation métier", "Réparer une panne électrique"), 1, "Le steward coordonne la qualité, les définitions et le suivi opérationnel."),
        ),
    ),
    Skill(
        "metadata", "Métadonnées et glossaire",
        "Les métadonnées décrivent les jeux de données ; le glossaire harmonise les définitions des termes métiers.",
        "Le terme « client actif » est défini, avec une règle de calcul et un responsable identifiés.",
        ("roles",), (
            Question("À quoi sert en premier lieu un glossaire métier ?", ("Partager des définitions communes", "Compresser les bases", "Générer des mots de passe"), 0, "Un glossaire réduit les ambiguïtés de sens entre équipes."),
            Question("Le propriétaire, la date de mise à jour et la définition d'un champ sont des...", ("Sauvegardes", "Métadonnées", "Clés privées"), 1, "Ce sont des informations descriptives sur la donnée."),
        ),
    ),
    Skill(
        "catalog", "Catalogue de données",
        "Un catalogue rend les actifs de données découvrables et documente leurs métadonnées, usages et responsabilités.",
        "Une analyste trouve dans un catalogue le jeu de données des ventes, son propriétaire et ses avertissements de qualité.",
        ("metadata",), (
            Question("Quel est un bénéfice central d'un catalogue de données ?", ("Faciliter la recherche et la compréhension des actifs", "Remplacer les sauvegardes", "Supprimer le besoin de contrôles d'accès"), 0, "Le catalogue facilite la découverte et la compréhension, pas le contournement des contrôles."),
            Question("Un jeu de données est catalogué mais sa définition est absente. Quel problème subsiste ?", ("Aucun", "Son interprétation demeure ambiguë", "Il est nécessairement chiffré"), 1, "La découvrabilité ne remplace pas la compréhension métier."),
        ),
    ),
    Skill(
        "quality", "Qualité des données",
        "La qualité se mesure selon des dimensions comme l'exactitude, la complétude, la fraîcheur, l'unicité et la cohérence, en lien avec l'usage.",
        "Un tableau de bord suit la part des adresses clients manquantes et le délai de mise à jour.",
        ("roles",), (
            Question("Une adresse email manquante concerne surtout quelle dimension ?", ("Complétude", "Lignage", "Chiffrement"), 0, "La complétude décrit la présence des valeurs attendues."),
            Question("Deux fiches pour un même client concernent surtout...", ("La fraîcheur", "L'unicité", "Le chiffrement"), 1, "Les doublons sont un problème d'unicité des enregistrements."),
        ),
    ),
    Skill(
        "lineage", "Lignage et traçabilité",
        "Le lignage représente l'origine, les transformations et les dépendances des données de bout en bout.",
        "Un indicateur de chiffre d'affaires peut être relié aux transactions sources et aux traitements successifs.",
        ("metadata",), (
            Question("Le lignage sert principalement à...", ("Tracer l'origine et les transformations", "Augmenter la résolution d'écran", "Supprimer automatiquement toutes les erreurs"), 0, "Le lignage documente le parcours et les transformations des données."),
            Question("Un indicateur devient incohérent après un changement ETL. Quel outil conceptuel aide à retrouver les dépendances ?", ("Glossaire seul", "Lignage", "Calendrier RH"), 1, "La chaîne de transformation aide à analyser l'impact d'un changement."),
        ),
    ),
    Skill(
        "classification", "Classification de l'information",
        "La classification distingue les données selon leur sensibilité et les protections requises par le contexte.",
        "Une organisation classe des dossiers RH comme confidentiels et limite les personnes autorisées à y accéder.",
        ("strategy",), (
            Question("Pourquoi classer les données selon leur sensibilité ?", ("Pour adapter les protections", "Pour rendre toutes les données publiques", "Pour supprimer les responsables"), 0, "Les niveaux de sensibilité aident à proportionner les contrôles."),
            Question("Des données de paie sont diffusées sans restriction. Quelle priorité ?", ("Créer un nouveau logo", "Revoir classification et accès", "Ignorer la diffusion"), 1, "Il faut examiner les accès et protections au regard de la sensibilité."),
        ),
    ),
    Skill(
        "access", "Gestion des accès",
        "Le contrôle d'accès applique des autorisations proportionnées au besoin professionnel et revues régulièrement.",
        "Un analyste peut consulter des agrégats mais pas des identifiants individuels, faute de nécessité.",
        ("classification",), (
            Question("Que signifie le principe du moindre privilège ?", ("Accorder uniquement les accès nécessaires", "Accorder tous les accès", "Ne jamais réviser les droits"), 0, "L'accès doit rester proportionné au besoin de l'utilisateur."),
            Question("Une personne change de poste. Quel contrôle est approprié ?", ("Conserver tous les anciens droits", "Réévaluer ses autorisations", "Publier ses mots de passe"), 1, "Les droits doivent suivre les responsabilités effectives."),
        ),
    ),
    Skill(
        "privacy", "Protection des données personnelles",
        "La protection des données personnelles repose notamment sur la finalité, la minimisation, la transparence et des mesures de sécurité adaptées.",
        "Un formulaire ne demande que les informations nécessaires à un service déterminé.",
        ("classification",), (
            Question("La minimisation des données implique de...", ("Limiter la collecte aux données nécessaires", "Tout conserver indéfiniment", "Toujours tout rendre public"), 0, "Il faut limiter les données traitées à ce qui est pertinent et nécessaire à la finalité."),
            Question("Un registre des activités de traitement sert notamment à...", ("Répertorier les traitements de données personnelles", "Accélérer le CPU", "Remplacer les bases juridiques"), 0, "Il aide à documenter les traitements et la démarche de conformité."),
        ),
    ),
    Skill(
        "retention", "Cycle de vie et conservation",
        "Les durées de conservation, l'archivage et la suppression sont définis selon les finalités, obligations et besoins identifiés.",
        "Un référentiel prévoit un cycle de revue des données inactives et des règles d'effacement vérifiables.",
        ("privacy",), (
            Question("Une bonne règle de conservation doit être...", ("Sans limite définie", "Justifiée et liée à la finalité et aux obligations applicables", "Identique pour toute information"), 1, "Les durées se définissent selon les finalités et obligations, avec des règles documentées."),
            Question("Quelle pratique contribue au pilotage du cycle de vie ?", ("Ignorer les archives", "Définir des règles d'archivage et de suppression", "Copier les données partout"), 1, "La gouvernance inclut le suivi du cycle de vie et des actions de fin de conservation."),
        ),
    ),
    Skill(
        "mdm", "Données de référence et MDM",
        "Le Master Data Management vise la cohérence et la gestion maîtrisée des données de référence partagées entre applications.",
        "Un identifiant client de référence permet de relier des systèmes commerciaux et de facturation.",
        ("quality",), (
            Question("Que cherche à améliorer le MDM ?", ("La cohérence des entités de référence", "La vitesse du wifi", "La longueur des emails"), 0, "Le MDM aide à aligner les données maîtresses utilisées par plusieurs systèmes."),
            Question("Deux applications utilisent des identifiants clients incompatibles. Quel domaine est particulièrement concerné ?", ("MDM", "Affichage graphique", "Messagerie"), 0, "La résolution des identités de référence relève notamment du MDM."),
        ),
    ),
    Skill(
        "sharing", "Partage et data products",
        "Le partage des données nécessite des usages documentés, des responsabilités claires, une qualité suffisante et des droits adaptés.",
        "Un data product expose un indicateur documenté avec un responsable, un niveau de service et des conditions d'accès.",
        ("catalog", "access"), (
            Question("Avant de partager un jeu de données, que faut-il préciser ?", ("Usages, qualité, responsables et accès", "Seulement sa couleur", "Uniquement sa taille en octets"), 0, "Le partage durable suppose contexte, qualité et responsabilité."),
            Question("Une équipe réutilise une donnée sans en comprendre la définition. Quel risque est majeur ?", ("Mauvaise interprétation métier", "Panne certaine du disque", "Aucune conséquence possible"), 0, "Sans définition partagée, les réutilisations peuvent être erronées."),
        ),
    ),
)

BY_KEY = {skill.key: skill for skill in SKILLS}
INDEX = {skill.key: idx for idx, skill in enumerate(SKILLS)}


def get_skill(key: str) -> Skill:
    if key not in BY_KEY:
        raise ValueError(f"Compétence inconnue : {key}. Valeurs : {', '.join(BY_KEY)}")
    return BY_KEY[key]
