import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import shutil
from pathlib import Path


def run_task(
    task_id: str,
    trial: int,
    framework: str,
    config_dir: str = None,
    model: str = None,
    agent: str = None,
    timeout_minutes: int = 20,
    output_dir: str = "results",
):
    os.makedirs(output_dir, exist_ok=True)
    result = {
        "task_id": task_id,
        "trial": trial,
        "framework": framework,
        "status": "failed",
        "error": None,
        "wall_clock_seconds": None,
        "model": model,
        "agent": agent,
    }

    start_time = time.time()
    workdir = tempfile.mkdtemp(prefix=f"swebench-{task_id}-t{trial}-")

    try:
        ds = load_swebench_task(task_id)
        repo_url = f"https://github.com/{ds['repo']}.git"
        base_commit = ds["base_commit"]
        problem_statement = ds["problem_statement"]

        git_clone_with_commit(repo_url, base_commit, workdir)

        prompt = f"Fix the following issue in the codebase:\n\n{problem_statement}"

        if framework == "opencode-custom":
            cmd = build_opencode_cmd(prompt, workdir, config_dir, model, agent)
        elif framework == "opencode-plain":
            cmd = build_opencode_plain_cmd(prompt, workdir, model, agent)
        elif framework == "aider":
            cmd = build_aider_cmd(prompt, workdir, model)
        else:
            raise ValueError(f"Unknown framework: {framework}")

        env = os.environ.copy()
        if config_dir:
            env["OPENCODE_CONFIG_DIR"] = config_dir

        timeout_seconds = timeout_minutes * 60
        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=workdir,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )

        wall_clock = time.time() - start_time
        result["wall_clock_seconds"] = round(wall_clock, 1)
        result["return_code"] = proc.returncode
        result["stdout"] = proc.stdout[-5000:] if proc.stdout else ""
        result["stderr"] = proc.stderr[-2000:] if proc.stderr else ""

        diff = get_git_diff(workdir)
        if diff is None:
            result["status"] = "no_diff"
            result["error"] = "No git diff produced"
        else:
            result["status"] = "completed"
            result["diff"] = diff

    except subprocess.TimeoutExpired:
        result["status"] = "timeout"
        result["error"] = f"Exceeded {timeout_minutes} minute timeout"
        result["wall_clock_seconds"] = timeout_minutes * 60
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        result["wall_clock_seconds"] = round(time.time() - start_time, 1)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    out_path = os.path.join(output_dir, f"{task_id}_t{trial}_{framework}.json")
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)

    print(
        f"[{framework}] {task_id} trial {trial}: {result['status']} ({result.get('wall_clock_seconds', '?')}s)"
    )
    return result


def load_swebench_task(task_id: str):
    from datasets import load_dataset

    ds = load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
    for item in ds:
        if item["instance_id"] == task_id:
            return item
    raise ValueError(f"Task {task_id} not found")


def git_clone_with_commit(repo_url: str, commit: str, dest: str):
    subprocess.run(
        f"git init && git remote add origin {repo_url}",
        shell=True,
        cwd=dest,
        capture_output=True,
        text=True,
        timeout=120,
    )
    subprocess.run(
        f"git fetch origin --depth=1 {commit}",
        shell=True,
        cwd=dest,
        capture_output=True,
        text=True,
        timeout=120,
    )
    subprocess.run(
        f"git checkout {commit}",
        shell=True,
        cwd=dest,
        capture_output=True,
        text=True,
        timeout=60,
    )


def get_git_diff(workdir: str) -> str:
    result = subprocess.run(
        "git diff",
        shell=True,
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=30,
    )
    diff = result.stdout.strip()
    return diff if diff else None


def build_opencode_cmd(
    prompt: str, workdir: str, config_dir: str, model: str, agent: str
) -> str:
    model_flag = f" --model {model}" if model else ""
    agent_flag = f" --agent {agent}" if agent else ""
    escaped_prompt = json.dumps(prompt)
    return (
        f"opencode run {escaped_prompt}"
        f" --auto"
        f" --dir {workdir}"
        f"{model_flag}{agent_flag}"
        f" --print-logs"
    )


def build_opencode_plain_cmd(prompt: str, workdir: str, model: str, agent: str) -> str:
    model_flag = f" --model {model}" if model else ""
    agent_flag = f" --agent {agent}" if agent else ""
    escaped_prompt = json.dumps(prompt)
    return (
        f"opencode run {escaped_prompt}"
        f" --auto --pure"
        f" --dir {workdir}"
        f"{model_flag}{agent_flag}"
        f" --print-logs"
    )


def build_aider_cmd(prompt: str, workdir: str, model: str) -> str:
    model_flag = f" --model {model}" if model else ""
    escaped_prompt = json.dumps(prompt)
    return (
        f"aider --message {escaped_prompt}"
        f" --auto-commits"
        f" --no-suggest-shell-commands"
        f" --no-show-release-notes"
        f" --yes"
        f"{model_flag}"
        f" --no-git"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("task_id", help="SWE-bench task ID")
    parser.add_argument("--trial", type=int, default=1)
    parser.add_argument(
        "--framework",
        choices=["opencode-custom", "opencode-plain", "aider"],
        default="opencode-custom",
    )
    parser.add_argument("--config-dir", default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument("--agent", default=None)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--output-dir", default="results")
    args = parser.parse_args()
    run_task(
        task_id=args.task_id,
        trial=args.trial,
        framework=args.framework,
        config_dir=args.config_dir,
        model=args.model,
        agent=args.agent,
        timeout_minutes=args.timeout,
        output_dir=args.output_dir,
    )
