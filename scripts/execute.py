#!/usr/bin/env python3
"""phase 디렉터리의 step들을 순차 실행하는 SDD 하네스.

    py scripts/execute.py phases/0-mvp [--push]

예시 저장소(jha0313/ch5-silicon-valley-vibe-coding-technique)의 execute.py를 이식했다.
하네스는 AC를 직접 돌리지 않는다 — Claude에게 AC 실행과 index.json 갱신을 시키고,
그 status를 읽어 판정한다. 검증의 주체는 step 문서이지 하네스가 아니다.
"""

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Windows 콘솔 기본이 cp949라 ✓ 같은 문자에서 UnicodeEncodeError가 난다. 먼저 UTF-8로 돌린다.
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
MAX_RETRIES = 3
FEAT_MSG = "feat({phase}): step {num} — {name}"
CHORE_MSG = "chore({phase}): step {num} output"


def stamp():
    return datetime.now(KST).isoformat(timespec="seconds")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


class StepExecutor:
    def __init__(self, phase_path, auto_push=False):
        self.phase_dir = (ROOT / phase_path).resolve()
        self.phase_dir_name = self.phase_dir.name
        self.index_file = self.phase_dir / "index.json"
        self.top_index_file = ROOT / "phases" / "index.json"
        self.auto_push = auto_push

        if not self.index_file.exists():
            sys.exit(f"ERROR: {self.index_file} 없음")

        idx = read_json(self.index_file)
        self.project = idx.get("project", "project")
        self.phase = idx.get("phase", self.phase_dir_name)
        self.total = len(idx["steps"])

    # --- git ---

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                              encoding="utf-8", errors="replace")

    def checkout_branch(self):
        branch = f"feat-{self.phase}"
        cur = self.git("rev-parse", "--abbrev-ref", "HEAD")
        if cur.returncode != 0:
            sys.exit(f"ERROR: git repo가 아닙니다 — {cur.stderr.strip()}")
        if cur.stdout.strip() == branch:
            return
        exists = self.git("rev-parse", "--verify", branch).returncode == 0
        r = self.git("checkout", branch) if exists else self.git("checkout", "-b", branch)
        if r.returncode != 0:
            sys.exit(f"ERROR: 브랜치 {branch} checkout 실패 — {r.stderr.strip()}\n"
                     f"Hint: 변경사항을 commit하거나 stash한 뒤 다시 시도하세요.")
        print(f"  Branch: {branch}")

    def commit_step(self, num, name):
        """코드(feat)와 하네스 산출물(chore)을 분리해 커밋한다."""
        output_rel = f"phases/{self.phase_dir_name}/step{num}-output.json"
        index_rel = f"phases/{self.phase_dir_name}/index.json"

        self.git("add", "-A")
        self.git("reset", "HEAD", "--", output_rel)
        self.git("reset", "HEAD", "--", index_rel)
        if self.git("diff", "--cached", "--quiet").returncode != 0:
            msg = FEAT_MSG.format(phase=self.phase, num=num, name=name)
            if self.git("commit", "-m", msg).returncode == 0:
                print(f"  Commit: {msg}")

        self.git("add", "-A")
        if self.git("diff", "--cached", "--quiet").returncode != 0:
            self.git("commit", "-m", CHORE_MSG.format(phase=self.phase, num=num))

    # --- 가드레일 주입 & 컨텍스트 누적 ---

    def load_guardrails(self):
        """매 step마다 헌법과 docs 전문을 프롬프트 맨 앞에 넣는다."""
        sections = []
        claude_md = ROOT / "CLAUDE.md"
        if claude_md.exists():
            sections.append(f"## 프로젝트 규칙 (CLAUDE.md)\n\n{claude_md.read_text(encoding='utf-8')}")
        for doc in sorted((ROOT / "docs").glob("*.md")):
            sections.append(f"## {doc.stem}\n\n{doc.read_text(encoding='utf-8')}")
        return "\n\n---\n\n".join(sections)

    @staticmethod
    def step_context(index):
        """완료된 step의 summary만 누적해 전달한다 — 코드 전문을 다시 읽히지 않는다."""
        lines = [f"- Step {s['step']} ({s['name']}): {s['summary']}"
                 for s in index["steps"] if s["status"] == "completed" and s.get("summary")]
        return "## 이전 Step 산출물\n\n" + "\n".join(lines) + "\n\n" if lines else ""

    def preamble(self, guardrails, context, prev_error=None):
        retry = ""
        if prev_error:
            retry = ("\n## ⚠ 이전 시도 실패 — 아래 에러를 반드시 참고하여 수정하라\n\n"
                     f"{prev_error}\n\n---\n\n")
        example = FEAT_MSG.format(phase=self.phase, num="N", name="<step-name>")
        return (
            f"당신은 {self.project} 프로젝트의 개발자입니다. 아래 step을 수행하세요.\n\n"
            f"{guardrails}\n\n---\n\n{context}{retry}"
            "## 작업 규칙\n\n"
            "1. 이전 step에서 작성된 코드를 확인하고 일관성을 유지하라.\n"
            "2. 이 step에 명시된 작업만 수행하라. 추가 기능이나 파일을 만들지 마라.\n"
            "3. 기존 테스트를 깨뜨리지 마라.\n"
            "4. AC(Acceptance Criteria)를 직접 실행해 통과를 확인하라.\n"
            f"5. phases/{self.phase_dir_name}/index.json의 해당 step을 갱신하라:\n"
            "   - AC 통과 → status \"completed\" + summary에 산출물 한 줄 요약\n"
            f"   - {MAX_RETRIES}회 시도 후에도 실패 → status \"error\" + error_message\n"
            "   - 사람의 개입이 필요하면(키·인증·수동 설정) → status \"blocked\" + blocked_reason 후 즉시 중단\n"
            f"6. 모든 변경을 커밋하라: {example}\n\n---\n\n"
        )

    # --- Claude 호출 ---

    def invoke(self, step, preamble):
        step_file = self.phase_dir / f"step{step['step']}.md"
        if not step_file.exists():
            sys.exit(f"ERROR: {step_file} 없음")

        prompt = preamble + step_file.read_text(encoding="utf-8")
        r = subprocess.run(
            ["claude", "-p", "--dangerously-skip-permissions", "--output-format", "json", prompt],
            cwd=ROOT, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=1800,
        )
        if r.returncode != 0:
            print(f"  WARN: claude 비정상 종료 (code {r.returncode}) {r.stderr[:300]}")

        write_json(self.phase_dir / f"step{step['step']}-output.json", {
            "step": step["step"], "name": step["name"],
            "exitCode": r.returncode, "stdout": r.stdout, "stderr": r.stderr,
        })
        return r

    # --- 실행 ---

    def run_step(self, step, guardrails):
        num, name = step["step"], step["name"]
        prev_error = None

        for attempt in range(1, MAX_RETRIES + 1):
            index = read_json(self.index_file)
            tag = f"Step {num}/{self.total - 1}: {name}"
            if attempt > 1:
                tag += f" [retry {attempt}/{MAX_RETRIES}]"
            print(f"\n▶ {tag}")

            started = time.time()
            result = self.invoke(step, self.preamble(guardrails, self.step_context(index), prev_error))
            elapsed = int(time.time() - started)

            index = read_json(self.index_file)
            cur = next(s for s in index["steps"] if s["step"] == num)
            status = cur.get("status", "pending")

            if status == "completed":
                cur.setdefault("completed_at", stamp())
                write_json(self.index_file, index)
                print(f"  ✓ completed ({elapsed}s)")
                self.commit_step(num, name)
                return True

            if status == "blocked":
                print(f"  ⏸ blocked — {cur.get('blocked_reason', 'unknown')}")
                self.commit_step(num, name)
                return False

            prev_error = cur.get("error_message") or (result.stdout or "")[-1500:]
            print(f"  ✗ 미완료 ({elapsed}s) — 재시도 준비")

        index = read_json(self.index_file)
        for s in index["steps"]:
            if s["step"] == num:
                s["status"] = "error"
                s.setdefault("error_message", f"{MAX_RETRIES}회 시도 후에도 AC 미통과")
        write_json(self.index_file, index)
        print(f"  ✗ error — {MAX_RETRIES}회 실패")
        self.commit_step(num, name)
        return False

    def check_blockers(self):
        for s in read_json(self.index_file)["steps"]:
            if s["status"] == "error":
                sys.exit(f"\n  ✗ Step {s['step']} ({s['name']}) error: "
                         f"{s.get('error_message', 'unknown')}\n  고친 뒤 status를 pending으로 되돌리고 다시 실행하세요.")
            if s["status"] == "blocked":
                sys.exit(f"\n  ⏸ Step {s['step']} ({s['name']}) blocked: "
                         f"{s.get('blocked_reason', 'unknown')}\n  해결한 뒤 status를 pending으로 되돌리세요.")

    def finalize(self):
        index = read_json(self.index_file)
        if all(s["status"] == "completed" for s in index["steps"]):
            index.setdefault("completed_at", stamp())
            index["completed_at"] = index["completed_at"] or stamp()
            write_json(self.index_file, index)
            if self.top_index_file.exists():
                top = read_json(self.top_index_file)
                for p in top["phases"]:
                    if p["dir"] == self.phase_dir_name:
                        p["status"] = "completed"
                        p["completed_at"] = index["completed_at"]
                write_json(self.top_index_file, top)
            self.git("add", "-A")
            self.git("commit", "-m", f"chore({self.phase}): phase completed")
            print(f"\n  ✓ phase {self.phase} completed")
            if self.auto_push:
                self.git("push", "-u", "origin", f"feat-{self.phase}")
        else:
            left = [s["step"] for s in index["steps"] if s["status"] != "completed"]
            print(f"\n  남은 step: {left}")

    def run(self):
        print(f"\n{'=' * 56}\n  SDD Harness | {self.project}\n"
              f"  Phase: {self.phase} | Steps: {self.total}\n{'=' * 56}")
        self.check_blockers()
        self.checkout_branch()
        guardrails = self.load_guardrails()

        index = read_json(self.index_file)
        if not index.get("created_at"):
            index["created_at"] = stamp()
            write_json(self.index_file, index)

        for step in read_json(self.index_file)["steps"]:
            if step["status"] == "completed":
                continue
            if not self.run_step(step, guardrails):
                break
        self.finalize()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("phase_dir", help="예: phases/0-mvp")
    ap.add_argument("--push", action="store_true", help="완료 후 브랜치를 푸시한다")
    args = ap.parse_args()
    StepExecutor(args.phase_dir, auto_push=args.push).run()


if __name__ == "__main__":
    main()
