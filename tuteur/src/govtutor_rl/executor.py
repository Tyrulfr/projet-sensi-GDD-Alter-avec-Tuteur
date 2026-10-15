"""LLM Executor optionnel : aucun appel réseau sans choix explicite --llm."""
from __future__ import annotations

import json
import os
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .actions import ACTION_INTENTS, TutorAction
from .curriculum import Skill


def render_offline(skill: Skill, action: TutorAction) -> str:
    """Exécuteur déterministe de secours : utile sans API, sans garantie de pédagogie."""
    responses = {
        TutorAction.DIAGNOSE: f"Sur « {skill.title} », explique ton raisonnement et ce qui te paraît difficile.",
        TutorAction.SOCRATIC_QUESTION: f"Quel objectif métier justifie d'utiliser le principe suivant : {skill.concept}",
        TutorAction.HINT_SMALL: f"Indice : cherche le lien entre responsabilité, usage et risques dans « {skill.title} ».",
        TutorAction.HINT_STRONG: f"Indice plus précis : repars de cette définition, puis identifie ce qu'elle cherche à encadrer : {skill.concept}",
        TutorAction.EXPLAIN_CONCEPT: skill.concept,
        TutorAction.WORKED_EXAMPLE: f"Exemple distinct de la question : {skill.example}",
        TutorAction.PRACTICE_SAME: f"Donne un nouvel exemple concret d'application de « {skill.title} » dans une entreprise.",
        TutorAction.PRACTICE_EASIER: f"En une phrase simple, à quoi sert « {skill.title} » ?",
        TutorAction.PRACTICE_HARDER: f"Imagine un conflit entre deux départements autour de « {skill.title} ». Quelle décision prendrais-tu et comment la justifier ?",
        TutorAction.REVIEW_PREREQUISITE: f"Revenons au prérequis de « {skill.title} ». Quelle responsabilité doit être claire en premier ?",
        TutorAction.RETRIEVAL_QUIZ: f"Sans regarder la définition, rappelle les deux idées principales de « {skill.title} ».",
        TutorAction.SUMMARIZE: f"Résume « {skill.title} » et explique une conséquence métier de sa mauvaise application.",
    }
    return responses[action]


def build_messages(skill: Skill, action: TutorAction, student_message: str) -> list[dict[str, str]]:
    system = (
        "Tu es un tuteur en gouvernance de la donnée, en français. "
        "Ta stratégie pédagogique est fixée par un agent RL externe : applique-la exactement. "
        "N'invente pas de sources, de seuils réglementaires ni de règles universelles. "
        "Indique l'incertitude en cas d'élément réglementaire ou contextuel. "
        "Ne demande pas de données personnelles. Ne révèle pas la solution du QCM en cours. "
        "Réponds avec 120 mots maximum, une seule question si la stratégie l'exige. "
        f"Compétence : {skill.title}. Connaissance : {skill.concept}. "
        f"Exemple : {skill.example}. "
        f"STRATÉGIE IMPOSÉE : {action.name} : {ACTION_INTENTS[action]}"
    )
    return [{"role": "system", "content": system},
            {"role": "user", "content": student_message or "Propose ton intervention pédagogique."}]


def render_llm(skill: Skill, action: TutorAction, student_message: str) -> str:
    """OpenAI-compatible /chat/completions : opt-in explicite, données envoyées au serveur configuré."""
    base_url = os.environ.get("GOVTUTOR_LLM_BASE_URL", "").rstrip("/")
    model = os.environ.get("GOVTUTOR_LLM_MODEL", "")
    api_key = os.environ.get("GOVTUTOR_LLM_API_KEY", "")
    if not base_url or not model:
        raise RuntimeError("Configurer GOVTUTOR_LLM_BASE_URL et GOVTUTOR_LLM_MODEL avant --llm")
    parsed = urlparse(base_url)
    if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("URL du serveur invalide")
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1")):
        raise ValueError("URL HTTPS obligatoire (HTTP autorisé uniquement en local)")
    payload = {
        "model": model,
        "messages": build_messages(skill, action, student_message),
        "temperature": .2,
        "max_tokens": 250,
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = Request(base_url + "/chat/completions",
                      data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urlopen(request, timeout=40) as response:
        result = json.load(response)
    content = result["choices"][0]["message"]["content"]
    validate_response(content, action)
    return content


def validate_response(content: str, action: TutorAction) -> None:
    """Mechanical checks only; semantic fidelity still requires human evaluation."""
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Réponse LLM vide ou non textuelle")
    if len(content.split()) > 120:
        raise ValueError("Réponse LLM trop longue")
    if action in (TutorAction.DIAGNOSE, TutorAction.SOCRATIC_QUESTION, TutorAction.RETRIEVAL_QUIZ) and content.count("?") != 1:
        raise ValueError("Cette action exige une seule question")
