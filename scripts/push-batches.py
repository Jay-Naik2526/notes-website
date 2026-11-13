import os
import subprocess
import time
from pathlib import Path

DEPLOY_DIR = Path("/Users/JayNaik/Desktop/Notes Website/.deploy")
MAX_BATCH_BYTES = 20 * 1024 * 1024  # 20 MB

def run_cmd(cmd, cwd=DEPLOY_DIR, check=True):
    print(f"[{time.strftime('%H:%M:%S')}] RUN: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if res.stdout:
        print(res.stdout.strip())
    if res.stderr:
        print(res.stderr.strip())
    if check and res.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {res.returncode}")
    return res

def get_untracked_files():
    # find untracked files in lib/packs and lib/orig
    res = subprocess.run(["git", "status", "--porcelain", "-uall"], cwd=DEPLOY_DIR, text=True, capture_output=True, check=True)
    files = []
    for line in res.stdout.splitlines():
        if line.startswith("?? "):
            rel = line[3:].strip()
            if rel.startswith("lib/orig/") or rel.startswith("lib/packs/"):
                p = DEPLOY_DIR / rel
                if p.is_file():
                    files.append((rel, p.stat().st_size))
    # sort by path
    files.sort(key=lambda x: x[0])
    return files

def push_with_retry(max_retries=10, delay=5):
    for attempt in range(1, max_retries + 1):
        try:
            print(f"[{time.strftime('%H:%M:%S')}] Push attempt {attempt}/{max_retries}...")
            run_cmd(["git", "push", "origin", "HEAD:main"])
            print(f"[{time.strftime('%H:%M:%S')}] Push successful!")
            return True
        except Exception as e:
            print(f"[{time.strftime('%H:%M:%S')}] Push failed: {e}")
            if attempt < max_retries:
                print(f"Retrying in {delay}s...")
                time.sleep(delay)
            else:
                raise

def main():
    untracked = get_untracked_files()
    total_bytes = sum(s for _, s in untracked)
    print(f"Found {len(untracked)} untracked files ({total_bytes / 1024 / 1024:.1f} MB)")
    if not untracked:
        print("Nothing to push!")
        return

    # Group into batches <= MAX_BATCH_BYTES
    batches = []
    current_batch = []
    current_size = 0
    for rel, size in untracked:
        if current_batch and (current_size + size > MAX_BATCH_BYTES):
            batches.append((current_batch, current_size))
            current_batch = []
            current_size = 0
        current_batch.append(rel)
        current_size += size
    if current_batch:
        batches.append((current_batch, current_size))

    print(f"Formed {len(batches)} batches.")

    # Determine next part number
    log_res = subprocess.run(["git", "log", "-n", "20", "--oneline"], cwd=DEPLOY_DIR, text=True, capture_output=True)
    part_num = 2
    for line in log_res.stdout.splitlines():
        if "notes part " in line:
            try:
                p = int(line.split("notes part ")[1].split()[0])
                if p >= part_num:
                    part_num = p + 1
            except Exception:
                pass

    pushed_bytes = 0
    for idx, (batch_files, batch_size) in enumerate(batches, start=1):
        print(f"\n--- Batch {idx}/{len(batches)} ({batch_size / 1024 / 1024:.1f} MB, {len(batch_files)} files) ---")
        run_cmd(["git", "add"] + batch_files)
        commit_msg = f"notes part {part_num}"
        run_cmd(["git", "commit", "-m", commit_msg])
        part_num += 1
        push_with_retry()
        pushed_bytes += batch_size
        print(f"Progress: {pushed_bytes / 1024 / 1024:.1f} / {total_bytes / 1024 / 1024:.1f} MB ({pushed_bytes / total_bytes * 100:.1f}%)")

    print("\nAll batches committed and pushed successfully!")

if __name__ == "__main__":
    main()

