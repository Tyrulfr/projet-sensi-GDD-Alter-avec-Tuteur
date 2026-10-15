"""Interface de commande principale du démonstrateur."""
from __future__ import annotations

import argparse
import json

from .curriculum import SKILLS


def main():
    parser = argparse.ArgumentParser(prog="govtutor", description="Tuteur RL - gouvernance de la donnée")
    sub = parser.add_subparsers(dest="command", required=True)
    p_train = sub.add_parser("train", help="Entraîner la politique PPO sur le simulateur")
    p_train.add_argument("--steps", type=int, default=30_000)
    p_train.add_argument("--seed", type=int, default=42)
    p_train.add_argument("--output", default="models/governance_ppo")
    p_eval = sub.add_parser("evaluate", help="Comparer random, rules et RL")
    p_eval.add_argument("--simulator", choices=["standard", "spacing"], default="standard")
    p_eval.add_argument("--checkpoint", default=None)
    p_eval.add_argument("--episodes", type=int, default=120)
    p_eval.add_argument("--seed", type=int, default=1000)
    p_eval.add_argument("--output", default="results/benchmark.csv")
    p_lesson = sub.add_parser("lesson", help="Séance QCM dans le terminal")
    p_lesson.add_argument("--skill", default="quality", choices=[s.key for s in SKILLS])
    p_lesson.add_argument("--checkpoint", default=None)
    p_lesson.add_argument("--turns", type=int, default=8)
    p_lesson.add_argument("--llm", action="store_true", help="Autoriser un appel réseau vers un LLM configuré")
    p_serve = sub.add_parser("serve", help="Servir la formation et le pont PPO en local")
    p_serve.add_argument("--site", required=True)
    p_serve.add_argument("--checkpoint", default=None)
    p_serve.add_argument("--port", type=int, default=8000)
    sub.add_parser("skills", help="Afficher le curriculum")
    args = parser.parse_args()
    if args.command == "train":
        from .training import train
        print("Modèle sauvegardé :", train(args.output, args.steps, args.seed))
    elif args.command == "evaluate":
        from .evaluation import benchmark
        print(json.dumps(benchmark(args.checkpoint, args.episodes, args.seed, output=args.output, simulator=args.simulator),
                         indent=2, ensure_ascii=False))
    elif args.command == "lesson":
        from .interactive import lesson
        if args.turns < 1:
            parser.error("--turns doit être positif")
        lesson(args.skill, args.checkpoint, args.llm, args.turns)
    elif args.command == "serve":
        from .server import serve
        serve(args.site, args.checkpoint, args.port)
    elif args.command == "skills":
        for skill in SKILLS:
            print(f"{skill.key:16} {skill.title} | prérequis: {', '.join(skill.prerequisite) or '-'}")


if __name__ == "__main__":
    main()
