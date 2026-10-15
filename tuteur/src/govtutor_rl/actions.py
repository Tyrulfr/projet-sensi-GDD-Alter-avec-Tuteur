"""Contrat stable entre l'agent RL et l'exécuteur du LLM."""
from enum import IntEnum


class TutorAction(IntEnum):
    DIAGNOSE = 0
    SOCRATIC_QUESTION = 1
    HINT_SMALL = 2
    HINT_STRONG = 3
    EXPLAIN_CONCEPT = 4
    WORKED_EXAMPLE = 5
    PRACTICE_SAME = 6
    PRACTICE_EASIER = 7
    PRACTICE_HARDER = 8
    REVIEW_PREREQUISITE = 9
    RETRIEVAL_QUIZ = 10
    SUMMARIZE = 11


ACTION_INTENTS = {
    TutorAction.DIAGNOSE: "Demander une justification sans donner la solution.",
    TutorAction.SOCRATIC_QUESTION: "Poser une seule question guidée.",
    TutorAction.HINT_SMALL: "Fournir un indice léger sans divulguer la réponse.",
    TutorAction.HINT_STRONG: "Fournir un indice explicite sans donner la réponse complète.",
    TutorAction.EXPLAIN_CONCEPT: "Expliquer la notion et donner un repère conceptuel.",
    TutorAction.WORKED_EXAMPLE: "Illustrer avec un exemple distinct de la question évaluée.",
    TutorAction.PRACTICE_SAME: "Proposer un exercice de même niveau.",
    TutorAction.PRACTICE_EASIER: "Proposer un exercice plus simple.",
    TutorAction.PRACTICE_HARDER: "Proposer un cas d'application plus complexe.",
    TutorAction.REVIEW_PREREQUISITE: "Revenir sur un prérequis pertinent.",
    TutorAction.RETRIEVAL_QUIZ: "Tester le rappel d'une notion sans indice.",
    TutorAction.SUMMARIZE: "Faire reformuler les éléments essentiels.",
}
