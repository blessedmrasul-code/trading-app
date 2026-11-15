import math, os, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Premium vector-style portrait animation: 60 fps, Full HD, silent.
BASE_W, BASE_H = 720, 1280
S = 1.5
W, H = int(BASE_W*S), int(BASE_H*S)
FPS, DURATION = 60, 78
OUT = "two-futures.mp4"
BG = (9, 15, 29)
WHITE = (245, 248, 255)
MINT = (80, 224, 184)
CORAL = (255, 151, 119)
MUTED = (151, 166, 190)

def q(v): return int(v*S)
def box(b): return tuple(q(v) for v in b)
def font(n, bold=False):
    path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(path, q(n))
def rounded(d, b, r, fill, outline=None, width=1):
    d.rounded_rectangle(box(b), radius=q(r), fill=fill, outline=outline, width=q(width))
def text(d, xy, value, size, color=WHITE, bold=False, anchor="mm"):
    d.text((q(xy[0]),q(xy[1])), value, font=font(size,bold), fill=color, anchor=anchor, stroke_width=0)
def gradient():
    im=Image.new("RGB",(W,H)); px=im.load()
    top=(10,17,33); bottom=(13,29,42)
    for y in range(H):
        a=y/(H-1)
        c=tuple(int(top[i]*(1-a)+bottom[i]*a) for i in range(3))
        for x in range(W): px[x,y]=c
    return im
def glow(im, cx, cy, radius, color, alpha=35):
    layer=Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    d.ellipse((q(cx-radius),q(cy-radius),q(cx+radius),q(cy+radius)),fill=(*color,alpha))
    layer=layer.filter(ImageFilter.GaussianBlur(q(radius*.45)))
    im.paste(Image.alpha_composite(im.convert("RGBA"),layer).convert("RGB"))

BG_IMAGE=gradient()
glow(BG_IMAGE,560,280,260,(20,102,100),23)
glow(BG_IMAGE,120,750,230,(93,54,73),15)

def character(d, cx, cy, scale, jacket, skin, phase, confident=False):
    # Smooth, clean vector character; no pixel-art styling.
    bob=math.sin(phase*2.0)*2.2
    x,y=cx,cy+bob
    # shadow
    d.ellipse(box((x-78*scale,y+220*scale,x+78*scale,y+241*scale)),fill=(5,10,20))
    # legs and shoes
    d.rounded_rectangle(box((x-34*scale,y+150*scale,x-8*scale,y+235*scale)),radius=q(12*scale),fill=(35,43,61))
    d.rounded_rectangle(box((x+8*scale,y+150*scale,x+34*scale,y+235*scale)),radius=q(12*scale),fill=(35,43,61))
    d.rounded_rectangle(box((x-48*scale,y+220*scale,x-4*scale,y+240*scale)),radius=q(9*scale),fill=(18,24,39))
    d.rounded_rectangle(box((x+4*scale,y+220*scale,x+48*scale,y+240*scale)),radius=q(9*scale),fill=(18,24,39))
    # arms
    d.line((q(x-39*scale),q(y+80*scale),q(x-67*scale),q(y+150*scale)),fill=jacket,width=q(24*scale))
    d.line((q(x+39*scale),q(y+80*scale),q(x+65*scale),q(y+142*scale)),fill=jacket,width=q(24*scale))
    d.ellipse(box((x-77*scale,y+142*scale,x-58*scale,y+162*scale)),fill=skin)
    d.ellipse(box((x+56*scale,y+134*scale,x+75*scale,y+154*scale)),fill=skin)
    # torso
    d.rounded_rectangle(box((x-54*scale,y+48*scale,x+54*scale,y+177*scale)),radius=q(25*scale),fill=jacket)
    # collar / shirt detail
    d.polygon([ (q(x-16*scale),q(y+52*scale)),(q(x),q(y+76*scale)),(q(x+16*scale),q(y+52*scale)) ],fill=(226,235,241))
    # neck and head
    d.rounded_rectangle(box((x-15*scale,y+28*scale,x+15*scale,y+65*scale)),radius=q(8*scale),fill=skin)
    d.ellipse(box((x-45*scale,y-42*scale,x+45*scale,y+55*scale)),fill=skin)
    # hair
    d.pieslice(box((x-47*scale,y-49*scale,x+47*scale,y+35*scale)),180,360,fill=(35,29,31))
    d.ellipse(box((x-43*scale,y-20*scale,x-28*scale,y+8*scale)),fill=(35,29,31))
    # face
    d.ellipse(box((x-23*scale,y+4*scale,x-17*scale,y+10*scale)),fill=(35,31,32))
    d.ellipse(box((x+17*scale,y+4*scale,x+23*scale,y+10*scale)),fill=(35,31,32))
    if confident:
        d.arc(box((x-13*scale,y+17*scale,x+13*scale,y+35*scale)),5,170,fill=(112,57,49),width=q(2*scale))
    else:
        d.line((q(x-9*scale),q(y+29*scale),q(x+9*scale),q(y+29*scale)),fill=(112,57,49),width=q(2*scale))

def chart_card(im, progress, x=170, y=770):
    d=ImageDraw.Draw(im)
    rounded(d,(x,y,x+380,y+190),22,(17,29,46),outline=(47,69,89),width=2)
    text(d,(x+25,y+27),"ДИНАМИКА И ЦЕЛИ",15,MUTED,True,anchor="lm")
    # restrained grid
    for yy in (y+75,y+115,y+155):
        d.line((q(x+24),q(yy),q(x+355),q(yy)),fill=(35,51,69),width=q(1))
    # deliberately straight, data-like trend, never a decorative sine wave
    pts=[(x+28,y+151),(x+85,y+137),(x+137,y+143),(x+194,y+108),(x+249,y+96),(x+303,y+67),(x+350,y+54)]
    n=max(2,int(2+progress*(len(pts)-1)))
    visible=pts[:min(n,len(pts))]
    if len(visible)>1:
        d.line([(q(a),q(b)) for a,b in visible],fill=MINT,width=q(5),joint="curve")
        for a,b in visible: d.ellipse(box((a-4,b-4,a+4,b+4)),fill=MINT)
    text(d,(x+330,y+28),"+",18,MINT,True)

def caption(d, value, y=1080):
    rounded(d,(35,y-48,685,y+104),20,(8,14,27),outline=(39,59,78),width=1)
    words=value.split(); lines=[]; cur=""
    f=font(23,True)
    for w in words:
        candidate=(cur+" "+w).strip()
        if d.textbbox((0,0),candidate,font=f)[2] <= q(590): cur=candidate
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    for i,line in enumerate(lines[:3]): d.text((q(360),q(y-8+i*35)),line,font=f,fill=WHITE,anchor="mm")

CAPTIONS=[
(0,8,"Один человек каждый день ждёт, что однажды ему повезёт."),
(8,16,"Другой использует те же 24 часа, чтобы учиться и становиться сильнее."),
(16,24,"Первый тратит деньги, не задумываясь о последствиях."),
(24,32,"Второй ведёт бюджет, изучает финансовую грамотность и учится принимать решения."),
(32,40,"Но дело не в том, что один уже богат, а другой беден."),
(40,48,"Дело в привычках, знаниях и последовательности."),
(48,56,"Даже второй ошибается — но анализирует ошибки и изучает риски."),
(56,64,"Трейдинг не гарантирует заработок. Сначала нужно учиться и понимать риски."),
(64,71,"У тебя тоже есть 24 часа. Вопрос только в том, как ты ими распорядишься."),
(71,78,"ТВОЁ БУДУЩЕЕ НАЧИНАЕТСЯ С ТВОИХ РЕШЕНИЙ.")]

def frame(t):
    im=BG_IMAGE.copy()
    d=ImageDraw.Draw(im)
    # Ambient lighting is pre-rendered once for consistent, fast frames.
    d=ImageDraw.Draw(im)
    # fine vertical composition lines
    d.line((q(36),q(90),q(36),q(1000)),fill=(27,44,61),width=q(1))
    d.line((q(684),q(90),q(684),q(1000)),fill=(27,44,61),width=q(1))
    split=t<9 or 35<=t<41 or t>=68
    if split:
        rounded(d,(28,95,352,1010),26,(18,27,45),outline=(63,73,91),width=2)
        rounded(d,(368,95,692,1010),26,(15,34,42),outline=(45,104,91),width=2)
        text(d,(190,145),"ПРИВЫЧКА",22,CORAL,True)
        text(d,(530,145),"РАЗВИТИЕ",22,MINT,True)
        character(d,190,540,1.02,(150,70,79),(225,177,145),t,False)
        character(d,530,540,1.02,(35,125,111),(204,157,126),t+1,True)
        if t<9:
            rounded(d,(100,825,280,940),18,(26,35,53),outline=(82,96,117),width=2)
            text(d,(190,870),"БЕСКОНЕЧНАЯ",15,MUTED,True)
            text(d,(190,901),"ЛЕНТА",24,WHITE,True)
            rounded(d,(440,825,620,940),18,(16,48,47),outline=(55,150,125),width=2)
            text(d,(530,870),"ПЛАН",26,MINT,True);text(d,(530,905),"И ОБУЧЕНИЕ",15,WHITE,True)
        elif t<41:
            text(d,(190,875),"ОЖИДАНИЕ",21,CORAL,True);text(d,(530,875),"24 ЧАСА",30,MINT,True)
        else:
            text(d,(190,875),"СТАРЫЙ ПУТЬ",19,CORAL,True);text(d,(530,875),"НОВЫЕ РЕШЕНИЯ",18,MINT,True)
    else:
        # Main full-screen chapter
        if t<20:
            text(d,(360,205),"БЕЗ ПЛАНА",43,CORAL,True)
            character(d,360,525,1.22,(150,70,79),(225,177,145),t,False)
            rounded(d,(230,825,490,940),18,(26,35,53),outline=(82,96,117),width=2)
            text(d,(360,882),"СКРОЛЛИНГ",24,WHITE,True)
        elif t<35:
            text(d,(360,205),"ФИНАНСОВАЯ ГРАМОТНОСТЬ",27,MINT,True)
            character(d,360,510,1.16,(35,125,111),(204,157,126),t,True)
            rounded(d,(150,825,570,950),20,(16,42,44),outline=(55,150,125),width=2)
            text(d,(360,865),"БЮДЖЕТ  •  ЦЕЛИ",25,MINT,True)
            text(d,(360,915),"ЗНАНИЯ  •  ДИСЦИПЛИНА",18,WHITE,True)
        elif t<54:
            text(d,(360,205),"СНАЧАЛА — ЗНАНИЯ",37,MINT,True)
            chart_card(im,min(1,max(0,(t-35)/12)))
        elif t<68:
            text(d,(360,205),"ОШИБКИ — ЭТО ОПЫТ",35,CORAL,True)
            rounded(d,(125,800,595,960),22,(31,29,43),outline=(155,105,82),width=2)
            text(d,(360,855),"АНАЛИЗ И РИСКИ",27,CORAL,True)
            text(d,(360,910),"РЕШЕНИЯ НА ОСНОВЕ ДАННЫХ",17,WHITE,True)
        else:
            text(d,(360,205),"ТВОЙ ВЫБОР",48,MINT,True)
            character(d,360,525,1.22,(35,125,111),(204,157,126),t,True)
    cap=next((s for a,b,s in CAPTIONS if a<=t<b),"")
    caption(d,cap,1080)
    if t>=71:
        rounded(d,(105,1195,615,1245),14,(19,112,94))
        text(d,(360,1220),"ПОДПИШИСЬ  •  УЧИСЬ  •  ДУМАЙ",17,WHITE,True)
    return im

def main():
    cmd=["ffmpeg","-y","-f","rawvideo","-vcodec","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-c:v","libx264","-preset","veryfast","-crf","19","-pix_fmt","yuv420p","-movflags","+faststart",OUT]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for i in range(FPS*DURATION):
            p.stdin.write(frame(i/FPS).tobytes())
    finally:
        p.stdin.close()
    if p.wait(): raise RuntimeError("FFmpeg render failed")
    print("Rendered silent Full HD MP4:",OUT,os.path.getsize(OUT))

if __name__=="__main__": main()
