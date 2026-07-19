import argparse
import json
from datasets import load_dataset


def get_image_name(task_id: str) -> str:
    ds = load_dataset("princeton-nlp/SWE-bench_Lite", split="test")
    for item in ds:
        if item["instance_id"] == task_id:
            repo = item["repo"].replace("/", "__")
            env_type = item.get("env_type", "testbed")
            base_commit = item["base_commit"]
            return f"swebench/{repo}__{env_type}:{base_commit[:7]}"
    raise ValueError(f"Task {task_id} not found in SWE-bench Lite")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("task_id", help="SWE-bench task ID")
    args = parser.parse_args()
    print(get_image_name(args.task_id))
