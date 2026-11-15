import math, os, subprocess, textwrap, wave
from PIL import Image, ImageDraw, ImageFont
import numpy as np

W, H, FPS, DURATION = 720, 1280, 30, 78
OUT = "two-futures.mp4"
os.makedirs("frames", exist_ok=True)

def font(size, bold=False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"
    ]
    for p in paths:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F_SMALL, F_MED, F_BIG, F_HUGE = font(25, True), font(34, True), font(54, True), font(76, True)
def clamp(x,a=0,b=1): return max(a,min(b,x))
def ease(x):
    x=clamp(x); return x*x*(3-2*x)
def rounded(d, box, r, fill, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)
def centered(d, xy, txt, f, fill, anchor="mm", stroke_width=0, stroke_fill=(0,0,0)):
    d.text(xy, txt, font=f, fill=fill, anchor=anchor, stroke_width=stroke_width, stroke_fill=stroke_fill)
def wrap_lines(txt, f, maxw, draw):
    words=txt.split(); lines=[]; cur=""
    for word in words:
        test=(cur+" "+word).strip()
        if draw.textbbox((0,0),test,font=f)[2] <= maxw: cur=test
        else:
            if cur: lines.append(cur)
            cur=word
    if cur: lines.append(cur)
    return lines
def text_block(d, txt, y, f=F_MED, color=(245,248,255), maxw=630, line_gap=10):
    lines=wrap_lines(txt,f,maxw,d); h=f.size+line_gap
    for i,line in enumerate(lines): centered(d,(W//2,y+i*h),line,f,color)
def gradient(top,bottom):
    a=np.array(top,dtype=np.float32); b=np.array(bottom,dtype=np.float32)
    arr=np.zeros((H,W,3),dtype=np.uint8)
    for y in range(H): arr[y,:,:]=np.clip(a+(b-a)*(y/H),0,255)
    return Image.fromarray(arr,"RGB")
def glow(d,x,y,r,color,alpha=35):
    layer=Image.new("RGBA",(W,H),(0,0,0,0)); ld=ImageDraw.Draw(layer)
    ld.ellipse((x-r,y-r,x+r,y+r),fill=(*color,alpha))
    return layer
def character(im, x, y, scale, hoodie, skin, mood, t, side):
    d=ImageDraw.Draw(im)
    bob=math.sin(t*3.1+(0 if side=="A" else 1.4))*5
    x=int(x); y=int(y+bob); s=scale
    # soft ground shadow
    d.ellipse((x-78*s,y+260*s,x+78*s,y+284*s),fill=(9,13,27))
    # legs
    d.line((x-20*s,y+165*s,x-35*s,y+255*s),fill=(25,31,48),width=max(5,int(22*s)))
    d.line((x+20*s,y+165*s,x+38*s,y+255*s),fill=(25,31,48),width=max(5,int(22*s)))
    d.ellipse((x-62*s,y+244*s,x-15*s,y+265*s),fill=(13,18,31))
    d.ellipse((x+15*s,y+244*s,x+64*s,y+265*s),fill=(13,18,31))
    # torso and arms
    rounded(d,(x-58*s,y+72*s,x+58*s,y+190*s),int(28*s),hoodie)
    d.line((x-48*s,y+98*s,x-78*s,y+174*s),fill=hoodie,width=max(7,int(25*s)))
    d.line((x+48*s,y+98*s,x+75*s,y+164*s),fill=hoodie,width=max(7,int(25*s)))
    d.ellipse((x-88*s,y+162*s,x-66*s,y+184*s),fill=skin)
    d.ellipse((x+63*s,y+153*s,x+87*s,y+177*s),fill=skin)
    # head
    d.ellipse((x-49*s,y-12*s,x+49*s,y+88*s),fill=skin)
    # hair
    d.arc((x-49*s,y-18*s,x+49*s,y+52*s),180,355,fill=(24,23,28),width=max(5,int(17*s)))
    d.ellipse((x-37*s,y+22*s,x-29*s,y+30*s),fill=(24,28,35))
    d.ellipse((x+28*s,y+22*s,x+36*s,y+30*s),fill=(24,28,35))
    if mood=="smile":
        d.arc((x-17*s,y+35*s,x+18*s,y+60*s),5,170,fill=(80,37,35),width=max(2,int(3*s)))
    elif mood=="worried":
        d.arc((x-16*s,y+45*s,x+18*s,y+62*s),190,350,fill=(80,37,35),width=max(2,int(3*s)))
        d.line((x-30*s,y+14*s,x-8*s,y+20*s),fill=(60,35,35),width=max(2,int(3*s)))
    else:
        d.line((x-13*s,y+51*s,x+13*s,y+51*s),fill=(80,37,35),width=max(2,int(3*s)))
    # hoodie drawstring
    d.line((x-9*s,y+86*s,x-12*s,y+121*s),fill=(210,220,230),width=max(1,int(2*s)))
    d.line((x+9*s,y+86*s,x+12*s,y+121*s),fill=(210,220,230),width=max(1,int(2*s)))
def phone(d,x,y,t):
    rounded(d,(x-31,y-57,x+31,y+57),12,(18,25,43),outline=(145,164,194),width=3)
    rounded(d,(x-24,y-42,x+24,y+38),5,(45,67,98))
    centered(d,(x,y-8),"▶",font(26,True),(255,255,255))
    d.ellipse((x-4,y+45,x+4,y+53),fill=(160,175,195))
def chart(d,x,y,t):
    rounded(d,(x-105,y-65,x+105,y+65),18,(14,25,44),outline=(45,205,180),width=3)
    pts=[]
    for i in range(9):
        xx=x-82+i*20
        yy=y+34-math.sin(i*.8+t*.5)*18-i*4
        pts.append((xx,yy))
    d.line(pts,fill=(51,226,185),width=5)
    for px,py in pts: d.ellipse((px-3,py-3,px+3,py+3),fill=(230,255,250))
def split_bg(im,t):
    d=ImageDraw.Draw(im)
    d.rectangle((0,0,W//2,H),fill=(19,27,48))
    d.rectangle((W//2,0,W,H),fill=(24,35,43))
    d.rectangle((W//2-2,0,W//2+2,H),fill=(91,112,135))
    # subtle graphic lines
    for k in range(8):
        yy=(k*190+int(t*15))%H
        d.line((0,yy,W,yy),fill=(255,255,255,9),width=1)
def scene(t):
    split = t<9 or 35<=t<41 or t>=68
    if split:
        im=Image.new("RGB",(W,H),(15,22,39)); split_bg(im,t)
        # label headers
        d=ImageDraw.Draw(im)
        centered(d,(W*.25,145),"ПРИВЫЧКА",F_SMALL,(255,164,115))
        centered(d,(W*.75,145),"РАЗВИТИЕ",F_SMALL,(92,235,199))
        character(im,180,570,1.05,(160,73,77),(224,173,139),"worried",t,"A")
        character(im,540,570,1.05,(43,135,126),(202,151,117),"smile",t,"B")
        if t<9:
            phone(d,180,820,t)
            rounded(d,(450,760,630,900),20,(14,24,42),outline=(57,211,174),width=3)
            centered(d,(540,800),"ПЛАН",F_SMALL,(105,240,200))
            centered(d,(540,850),"УЧЁБА",F_SMALL,(245,248,255))
        elif t<41:
            centered(d,(180,850),"ОЖИДАНИЕ",F_SMALL,(255,174,130))
            centered(d,(540,850),"24 ЧАСА",F_MED,(113,240,205))
        else:
            centered(d,(180,850),"СТАРЫЙ ПУТЬ",F_SMALL,(255,174,130))
            centered(d,(540,850),"НОВЫЕ РЕШЕНИЯ",font(23,True),(113,240,205))
    else:
        im=gradient((11,17,33),(23,38,58)); d=ImageDraw.Draw(im)
        # moving abstract panels
        for i in range(6):
            xx=(i*157-int(t*22))%900-100
            d.line((xx,210,xx+170,1010),fill=(31,54,77),width=2)
        if t<20:
            character(im,350,550,1.35,(160,73,77),(224,173,139),"worried",t,"A")
            phone(d,350,880,t)
            centered(d,(350,260),"БЕЗ ПЛАНА",F_BIG,(255,166,125))
        elif t<35:
            character(im,350,570,1.3,(43,135,126),(202,151,117),"smile",t,"B")
            rounded(d,(190,860,530,1010),22,(17,35,49),outline=(61,207,175),width=3)
            centered(d,(360,910),"БЮДЖЕТ",F_MED,(116,238,203))
            centered(d,(360,965),"ЦЕЛИ  •  ЗНАНИЯ",F_SMALL,(235,246,245))
        elif t<54:
            character(im,350,570,1.25,(43,135,126),(202,151,117),"neutral",t,"B")
            chart(d,350,860,t)
            centered(d,(350,260),"СНАЧАЛА — ЗНАНИЯ",font(42,True),(112,237,203))
        elif t<68:
            character(im,350,570,1.25,(43,135,126),(202,151,117),"worried",t,"B")
            rounded(d,(205,825,515,970),22,(36,32,48),outline=(238,163,106),width=3)
            centered(d,(360,865),"ОШИБКА",F_MED,(255,180,127))
            centered(d,(360,920),"АНАЛИЗ  •  РИСК",F_SMALL,(245,245,250))
        else:
            character(im,350,570,1.3,(43,135,126),(202,151,117),"smile",t,"B")
            centered(d,(350,260),"ТВОЙ ВЫБОР",F_BIG,(117,239,204))
    return im

captions=[
(0,8,"Один человек каждый день ждёт, что однажды ему повезёт."),
(8,16,"Другой использует те же 24 часа, чтобы учиться и становиться сильнее."),
(16,24,"Первый тратит деньги, не задумываясь о последствиях."),
(24,32,"Второй ведёт бюджет, изучает финансовую грамотность и учится принимать решения."),
(32,40,"Но дело не в том, что один уже богат, а другой беден."),
(40,48,"Дело в привычках, знаниях и последовательности."),
(48,56,"Даже второй ошибается — но анализирует ошибки и изучает риски."),
(56,64,"Трейдинг не гарантирует заработок. Сначала нужно учиться и понимать риски."),
(64,71,"У тебя тоже есть 24 часа. Вопрос только в том, как ты ими распорядишься."),
(71,78,"ТВОЁ БУДУЩЕЕ НАЧИНАЕТСЯ С ТВОИХ РЕШЕНИЙ.")
]
def draw_caption(im,t):
    d=ImageDraw.Draw(im)
    cap=next((c for a,b,c in captions if a<=t<b),"")
    if not cap:return
    # lower-third translucent plate
    overlay=Image.new("RGBA",(W,H),(0,0,0,0)); od=ImageDraw.Draw(overlay)
    rounded(od,(34,1030,686,1190),26,(5,10,22,218),outline=(74,112,135,160),width=2)
    im.paste(overlay,(0,0),overlay)
    d=ImageDraw.Draw(im)
    f=font(29 if len(cap)<70 else 25,True)
    lines=wrap_lines(cap,f,590,d)
    for i,line in enumerate(lines[:3]):
        # Highlight key words with cyan via segmented text
        centered(d,(360,1070+i*42),line,f,(244,248,255))
    if t>=71:
        rounded(d,(58,1110,662,1180),18,(22,110,96))
        centered(d,(360,1145),"ПОДПИШИСЬ • УЧИСЬ • ДУМАЙ",font(24,True),(255,255,255))

def make_music(path, seconds):
    sr=44100; n=int(sr*seconds); t=np.arange(n)/sr
    # restrained cinematic electronic bed, no copyrighted material
    beat=np.zeros(n,dtype=np.float32)
    for start in np.arange(0,seconds,0.5):
        idx=int(start*sr); end=min(n,idx+int(.12*sr))
        if end>idx:
            x=np.arange(end-idx)/sr
            beat[idx:end]+=0.045*np.sin(2*np.pi*(85-40*x/.12)*x)*np.exp(-x*28)
    pad=(0.025*np.sin(2*np.pi*110*t)+0.018*np.sin(2*np.pi*164.81*t)+0.012*np.sin(2*np.pi*220*t))
    swell=(0.55+0.45*np.sin(2*np.pi*t/18)**2)
    audio=np.clip((pad*swell+beat)*0.75,-0.9,0.9)
    stereo=np.stack([audio,audio],axis=1)
    with wave.open(path,"wb") as wf:
        wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(sr)
        wf.writeframes((stereo*32767).astype("<i2").tobytes())

def main():
    voice_text=("Один человек каждый день ждёт, что однажды ему повезёт. "
    "Другой использует те же двадцать четыре часа, чтобы учиться и становиться сильнее. "
    "Первый тратит деньги, не задумываясь о последствиях. "
    "Второй ведёт бюджет, изучает финансовую грамотность и учится принимать решения. "
    "Но дело не в том, что один уже богат, а другой беден. "
    "Дело в привычках, знаниях и последовательности. "
    "Даже второй ошибается, но анализирует ошибки, изучает риски и не верит в лёгкие деньги. "
    "Трейдинг не гарантирует заработок. Это сфера, в которой сначала нужно учиться, понимать риски и отвечать за свои решения. "
    "У тебя тоже есть двадцать четыре часа. Вопрос только в том, как ты ими распорядишься. "
    "Твоё будущее начинается с твоих решений.")
    with open("voice.txt","w",encoding="utf-8") as f:f.write(voice_text)
    subprocess.run(["edge-tts","--voice","ru-RU-DmitryNeural","--rate","-8%","--text",voice_text,"--write-media","voice.mp3"],check=True)
    cmd=["ffmpeg","-y","-f","rawvideo","-vcodec","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-c:v","libx264","-preset","veryfast","-crf","20","-pix_fmt","yuv420p","silent.mp4"]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    total=FPS*DURATION
    for frame in range(total):
        t=frame/FPS
        im=scene(t)
        draw_caption(im,t)
        p.stdin.write(im.tobytes())
    p.stdin.close()
    if p.wait()!=0: raise RuntimeError("FFmpeg video render failed")
    make_music("music.wav",DURATION)
    subprocess.run(["ffmpeg","-y","-i","silent.mp4","-i","voice.mp3","-i","music.wav",
        "-filter_complex","[1:a]volume=1.35,apad=pad_dur=78[voice];[2:a]volume=0.30[music];[voice][music]amix=inputs=2:duration=longest:dropout_transition=2[a]",
        "-map","0:v:0","-map","[a]","-t",str(DURATION),"-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",OUT],check=True)
    print("Created",OUT,os.path.getsize(OUT))
if __name__=="__main__": main()
