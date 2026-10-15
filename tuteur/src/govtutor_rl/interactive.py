"""Mode terminal avec QCM réels, politique RL en pilotage et LLM optionnel.

Démonstrateur : le tracker humain n'est pas un modèle de connaissances validé.
"""
from __future__ import annotations

import numpy as np

from .actions import TutorAction
from .curriculum import BY_KEY, INDEX, SKILLS
from .executor import render_llm, render_offline
from .policies import RLPolicy, RuleBasedPolicy


def lesson(skill_key: str, checkpoint: str | None, use_llm: bool = False, turns: int = 8):
    if skill_key not in BY_KEY:
        raise ValueError(f"Compétence inconnue : {skill_key}. Choix : {', '.join(BY_KEY)}")
    skill = BY_KEY[skill_key]
    policy = RLPolicy(checkpoint) if checkpoint else RuleBasedPolicy()
    belief = .45
    uncertainty = .70
    accuracy = .50
    fatigue = .10
    errors = 0
    hints = 0
    diagnosed = False
    rng = np.random.default_rng(2026)
    last_action = 0
    history = []
    print(f"\nSéance : {skill.title} (démonstration non validée sur l'humain)")
    print("Ne saisis ni données personnelles ni informations internes confidentielles.")
    print("Le diagnostic utilise uniquement les QCM suivants. Tape 'q' pour quitter.\n")
    for step in range(turns):
        mask = np.ones(len(TutorAction), dtype=bool)
        mask[TutorAction.SUMMARIZE] = step >= 3
        mask[TutorAction.PRACTICE_HARDER] = belief >= .6 and fatigue <= .83
        mask[TutorAction.REVIEW_PREREQUISITE] = bool(skill.prerequisite)
        mask[TutorAction.RETRIEVAL_QUIZ] = step > 0
        prereq_belief = .60 if skill.prerequisite else 1.0
        obs = np.array([belief, uncertainty, prereq_belief, accuracy, fatigue,
                        hints / max(turns, 3), errors / max(turns, 3), step / max(turns, 3),
                        last_action / 11, INDEX[skill.key] / (len(SKILLS) - 1), float(diagnosed)],
                       dtype=np.float32)
        action = TutorAction(policy.act(obs, mask, rng))
        last_action = int(action)
        if action == TutorAction.DIAGNOSE:
            diagnosed = True
        if action in (TutorAction.HINT_SMALL, TutorAction.HINT_STRONG):
            hints += 1
        print(f"\n[Tuteur : {action.name}]")
        if use_llm:
            # Explicit opt-in ; n'envoie que la notion et le message générique.
            try:
                print(render_llm(skill, action, "Aide-moi à progresser sur cette notion."))
            except (OSError, ValueError, KeyError, IndexError, RuntimeError) as exc:
                print(f"Exécuteur LLM indisponible ({type(exc).__name__}) ; secours local.")
                print(render_offline(skill, action))
        else:
            print(render_offline(skill, action))
        q = skill.questions[step % len(skill.questions)]
        print("\nQCM de vérification :", q.prompt)
        for j, option in enumerate(q.options, start=1):
            print(f"  {j}. {option}")
        while True:
            response = input("Ta réponse [1/2/3/q] : ").strip().lower()
            if response in ("1", "2", "3", "q"):
                break
            print("Saisis 1, 2, 3 ou q.")
        if response == "q":
            break
        correct = (int(response) - 1) == q.correct
        print("Correct !" if correct else "Pas encore. " + q.explanation)
        errors += int(not correct)
        accuracy = .7 * accuracy + .3 * float(correct)
        belief = float(np.clip(.78 * belief + .22 * float(correct), 0, 1))
        uncertainty = max(.12, uncertainty * .88)
        fatigue = min(1, fatigue + .028)
        history.append(correct)
    print(f"\nBilan : {sum(history)}/{len(history)} réponses correctes." if history else "\nSéance interrompue.")
    print("Ces mêmes QCM se répètent : ce score n'est PAS une mesure de progression indépendante.")
