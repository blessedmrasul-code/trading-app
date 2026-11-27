import json
import os
import subprocess
import time
from pathlib import Path
import requests

SPACE = "https://lightricks-ltx-video-distilled.hf.space"
API = SPACE + "/gradio_api/call/text_to_video"
OUT = Path("output")
TMP = OUT / "work"
TMP.mkdir(parents=True, exist_ok=True)

HERO = "same 16-year-old anime boy, slim teenage build, short messy dark hair, brown eyes, black hoodie with violet details, youthful face, consistent character design"
STYLE = "premium cinematic 2D anime, dark charcoal shadows, restrained violet neon, detailed hand-drawn animation, smooth camera movement, atmospheric night lighting, vertical composition"
NEG = "blurry, distorted face, extra fingers, watermark, wrong text, adult man, low quality"

PROMPTS = [
    HERO + ". Late at night he sits at a desk, overwhelmed by red and green trading charts, rain on the window, worried expression, slow camera push-in. " + STYLE,
    HERO + ". He discovers an educational trading simulator glowing violet on his monitor, curiosity replaces confusion, over-the-shoulder camera, no readable interface text. " + STYLE,
    HERO + ". He studies a short lesson and practices on a clearly virtual trading chart, focused expression, smooth side camera move, no real money or real trades. " + STYLE,
    HERO + ". He sits upright and confident, violet light reflects in his eyes, the chart becomes orderly, cinematic pull-back, hopeful mood, no words or logos. " + STYLE,
]

def parse_result(raw):
    for block in reversed([x for x in raw.split("\n\n") if x.strip()]):
        event, data = "", ""
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            if line.startswith("data:"):
                data = line.split(":", 1)[1].strip()
        if event == "error":
            raise RuntimeError("Hugging Face generation error: " + data)
        if event == "complete" and data:
            obj = json.loads(data)
            item = obj[0] if isinstance(obj, list) else obj
            if isinstance(item, dict):
                if isinstance(item.get("video"), dict):
                    return item["video"].get("url") or item["video"].get("path")
                return item.get("url") or item.get("path")
    raise RuntimeError("No completed video returned by the public Space.")

def generate_once(prompt, n, headers):
    body = {"data": [prompt, NEG, "", "", 1280, 720, "text-to-video", 6.75, 9, 20261127+n, True, 1, True]}
    res = requests.post(API, json=body, headers=headers, timeout=90)
    res.raise_for_status()
    event_id = res.json().get("event_id")
    if not event_id:
        raise RuntimeError("Space did not return an event id: " + res.text[:500])
    print("Waiting for scene", n, "(shared free queue)...", flush=True)
    res = requests.get(API + "/" + event_id, headers=headers, timeout=(30, 900))
    res.raise_for_status()
    url = parse_result(res.text)
    if not url:
        raise RuntimeError("Space completed without returning a video URL.")
    if url.startswith("/"):
        url = SPACE + url
    target = TMP / ("scene_" + str(n) + ".mp4")
    with requests.get(url, stream=True, timeout=180) as dl:
        dl.raise_for_status()
        with target.open("wb") as f:
            for chunk in dl.iter_content(1024 * 1024):
                if chunk:
                    f.write(chunk)
    if target.stat().st_size < 10000:
        raise RuntimeError("Downloaded scene is unexpectedly small.")
    return target

def generate(prompt, n):
    headers = {"Content-Type": "application/json"}
    if os.getenv("HF_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["HF_TOKEN"]
    delays = [20, 45, 90]
    last_error = None
    for attempt in range(1, len(delays) + 2):
        try:
            print("Scene", n, "- attempt", attempt, "of", len(delays) + 1, flush=True)
            return generate_once(prompt, n, headers)
        except Exception as exc:
            last_error = exc
            print("Scene", n, "attempt", attempt, "failed:", repr(exc), flush=True)
            if attempt <= len(delays):
                wait = delays[attempt - 1]
                print("Retrying scene", n, "in", wait, "seconds...", flush=True)
                time.sleep(wait)
    raise RuntimeError("Scene " + str(n) + " failed after retries. Last error: " + repr(last_error))

def run(args):
    print("+", " ".join(str(x) for x in args), flush=True)
    subprocess.run(args, check=True)

def main():
    clips = [generate(prompt, i) for i, prompt in enumerate(PROMPTS, 1)]
    normalized = []
    for i, clip in enumerate(clips, 1):
        dest = TMP / ("normalized_" + str(i) + ".mp4")
        run(["ffmpeg", "-y", "-i", str(clip), "-t", "6.75",
             "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setsar=1",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
             "-pix_fmt", "yuv420p", str(dest)])
        normalized.append(dest)

    concat = TMP / "clips.txt"
    concat.write_text("".join("file '" + str(p.resolve()) + "'\n" for p in normalized), encoding="utf-8")
    story = TMP / "story.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(story)])

    endcard = TMP / "endcard.mp4"
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    vf = ("drawtext=fontfile=" + font + ":text='ARVEX':fontcolor=white:fontsize=104:x=(w-text_w)/2:y=470,"
          "drawtext=fontfile=" + font + ":text='Торгуй. Развивайся. Побеждай.':fontcolor=0xB99AFF:fontsize=25:x=(w-text_w)/2:y=625,"
          "drawtext=fontfile=" + font + ":text='Начни обучение с ARVEX':fontcolor=white:fontsize=27:x=(w-text_w)/2:y=710")
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=#090711:s=720x1280:r=30:d=3",
         "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(endcard)])

    final_list = TMP / "final.txt"
    final_list.write_text("file '" + str(story.resolve()) + "'\nfile '" + str(endcard.resolve()) + "'\n", encoding="utf-8")
    final = OUT / "ARVEX-30s-720p.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(final_list),
         "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "22", "-movflags", "+faststart", "-an", str(final)])
    print("SUCCESS:", final, "bytes:", final.stat().st_size)

if __name__ == "__main__":
    main()
