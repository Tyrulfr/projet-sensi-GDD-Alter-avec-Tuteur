from govtutor_rl.actions import TutorAction
from govtutor_rl.curriculum import get_skill
from govtutor_rl.executor import build_messages, render_offline


def test_offline_response_and_llm_contract():
    skill = get_skill("privacy")
    result = render_offline(skill, TutorAction.EXPLAIN_CONCEPT)
    assert "minimisation" in result
    messages = build_messages(skill, TutorAction.HINT_SMALL, "Je ne comprends pas")
    assert len(messages) == 2
    assert "HINT_SMALL" in messages[0]["content"]
    assert "Je ne comprends pas" in messages[1]["content"]
