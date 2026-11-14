#!/usr/bin/env python3
"""Render a 30s vertical ARVEX 2D motion-design ad at 60 fps."""
import math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W,H,FPS,DURATION = 720,1280,60,30
TOTAL = FPS*DURATION
BG=(7,12,20); PANEL=(14,24,36); CYAN=(45,226,210); WHITE=(239,246,250); MUTED=(137,159,176); RED=(255,92,112); GREEN=(54,220,158)
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
def font(sz,b=False): return ImageFont.truetype(BOLD if b else FONT,sz)
def ease(x):
    x=max(0,min(1,x)); return x*x*(3-2*x)
def rounded(d,box,r,fill,outline=None,width=1): d.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)
def centered(d, y, txt, f, fill=WHITE, spacing=10):
    lines=txt.split("\n")
    heights=[d.textbbox((0,0),s,font=f)[3] for s in lines]
    yy=y
    for s,hh in zip(lines,heights):
        bb=d.textbbox((0,0),s,font=f); d.text(((W-(bb[2]-bb[0]))/2,yy),s,font=f,fill=fill)
        yy += hh+spacing
def glow(im,xy,r=18,color=CYAN):
    layer=Image.new("RGBA",im.size,(0,0,0,0)); q=ImageDraw.Draw(layer)
    x,y=xy; q.ellipse((x-r,y-r,x+r,y+r),fill=(*color,95))
    layer=layer.filter(ImageFilter.GaussianBlur(r*1.3)); im.alpha_composite(layer)
def base(t):
    im=Image.new("RGBA",(W,H),(*BG,255)); d=ImageDraw.Draw(im)
    # subtle technical grid
    for x in range(0,W,48): d.line((x,0,x,H),fill=(15,28,41,100),width=1)
    for y in range(0,H,48): d.line((0,y,W,y),fill=(15,28,41,100),width=1)
    # ambient glows
    glow(im,(int(90+35*math.sin(t*.4)),250),115,(14,115,126))
    glow(im,(620,980),150,(20,78,116))
    d=ImageDraw.Draw(im)
    d.text((42,42),"ARVEX",font=font(28,True),fill=WHITE)
    d.rounded_rectangle((42,83,132,87),radius=2,fill=CYAN)
    return im
def chart(d,box,t,large=False):
    x1,y1,x2,y2=box
    rounded(d,box,22,(11,22,34),outline=(35,62,78),width=2)
    for i in range(1,5):
        yy=y1+(y2-y1)*i/5; d.line((x1+18,yy,x2-18,yy),fill=(28,47,62),width=1)
    pts=[]
    n=30
    for i in range(n):
        x=x1+24+i*(x2-x1-48)/(n-1)
        trend=i*.8+math.sin(i*.72)*5+math.sin(i*.21)*8
        y=y2-30-trend-(math.sin(t*2+i*.42)*4)
        pts.append((int(x),int(y)))
    d.line(pts,fill=CYAN,width=4,joint="curve")
    for i in range(2,n,3):
        x=pts[i][0]; y=pts[i][1]; col=GREEN if i%2 else RED
        d.line((x,y-15,x,y+16),fill=col,width=2)
        d.rounded_rectangle((x-5,y-8,x+5,y+8),radius=2,fill=col)
    d.ellipse((pts[-1][0]-6,pts[-1][1]-6,pts[-1][0]+6,pts[-1][1]+6),fill=WHITE)
def person_scene(im,t):
    d=ImageDraw.Draw(im)
    # desk and chair
    d.ellipse((75,690,390,1110),fill=(12,23,35),outline=(34,55,70),width=3)
    d.rounded_rectangle((245,520,475,850),radius=85,fill=(26,42,57))
    # torso
    d.rounded_rectangle((220,620,505,950),radius=95,fill=(31,54,70))
    # head bowed slightly
    d.ellipse((295,390,445,555),fill=(184,133,104))
    d.pieslice((285,365,455,535),180,350,fill=(23,28,34))
    d.polygon([(300,455),(320,390),(440,405),(430,465)],fill=(23,28,34))
    # arm reaching laptop
    d.line((280,700,420,820),fill=(184,133,104),width=38)
    d.line((420,820,520,820),fill=(184,133,104),width=30)
    # laptop
    rounded(d,(360,720,650,930),18,(24,39,53),outline=(88,121,139),width=3)
    chart(d,(380,740,630,890),t,True)
    d.polygon([(340,930),(670,930),(630,955),(365,955)],fill=(103,130,145))
    # floating red alert
    a=ease((t-1.1)/1.2)
    if a>0:
        rounded(d,(55,565-int(a*25),270,640-int(a*25)),18,(43,20,31),outline=RED,width=2)
        d.text((78,585-int(a*25)),"MARKET ALERT",font=font(18,True),fill=RED)
def text_panel(im,headline,sub="",y=210,alpha=255):
    d=ImageDraw.Draw(im)
    centered(d,y,headline,font(43,True),WHITE,14)
    if sub: centered(d,y+135,sub,font(23),MUTED,9)
def scene(im,idx,local,t):
    d=ImageDraw.Draw(im)
    if idx==0:
        person_scene(im,local)
        text_panel(im,"ДУМАЕШЬ, ТРЕЙДИНГ\n— ЭТО ЛЕГКО?","Рынок не прощает спешки.",160)
    elif idx==1:
        chart(d,(65,300,655,720),local)
        # downward red sweep
        p=ease(local/3)
        d.line((100,390,210,430,315,410,430,560,590,650),fill=RED,width=8,joint="curve")
        centered(d,180,"ОДНА ОШИБКА",font(48,True),WHITE)
        centered(d,790,"МОЖЕТ СТОИТЬ ДОРОГО",font(30,True),RED)
        centered(d,875,"Сначала пойми, что делаешь.",font(22),MUTED)
    elif idx==2:
        # portal transition to brand
        rounded(d,(60,300,660,900),36,(12,26,39),outline=CYAN,width=3)
        for i in range(4):
            x=100+i*140
            rounded(d,(x,390,x+110,520),18,(20,42,55),outline=(42,92,106),width=2)
            d.line((x+22,480,x+48,440,x+75,455,x+91,415),fill=CYAN,width=4)
        centered(d,600,"ЗНАКОМЬСЯ С ARVEX",font(43,True),WHITE)
        centered(d,685,"Обучение трейдингу с нуля",font(25),CYAN)
        centered(d,790,"Понимание рынка начинается\nс правильных знаний.",font(22),MUTED,12)
    elif idx==3:
        centered(d,170,"ТВОЁ ОБУЧЕНИЕ",font(42,True),WHITE)
        centered(d,235,"ПОШАГОВО И ПОНЯТНО",font(25),CYAN)
        cards=[("01","ОСНОВЫ РЫНКА","Разберись в главном"),("02","ЧТЕНИЕ ГРАФИКОВ","Понимай движение цены"),("03","СТРАТЕГИИ","Изучай и проверяй подходы")]
        for i,(num,title,desc) in enumerate(cards):
            y=350+i*190
            x=int(70+18*math.sin(local*1.4-i))
            rounded(d,(x,y,650,y+145),24,(14,28,42),outline=(42,74,91),width=2)
            rounded(d,(x+22,y+27,x+92,y+97),18,(19,68,77),outline=CYAN,width=2)
            d.text((x+42,y+46),num,font=font(22,True),fill=CYAN)
            d.text((x+118,y+32),title,font=font(23,True),fill=WHITE)
            d.text((x+118,y+78),desc,font=font(18),fill=MUTED)
    elif idx==4:
        chart(d,(65,300,655,690),local)
        centered(d,175,"УЧИСЬ НА ПРАКТИКЕ",font(39,True),WHITE)
        centered(d,760,"ИЗУЧАЙ. АНАЛИЗИРУЙ.\nПРОВЕРЯЙ СТРАТЕГИИ.",font(31,True),CYAN,14)
        centered(d,910,"Тренируй навыки без риска\nреальными средствами.",font(22),MUTED,12)
    else:
        # final logo reveal
        glow(im,(360,480),145)
        d=ImageDraw.Draw(im)
        centered(d,350,"ARVEX",font(100,True),WHITE,0)
        d.rounded_rectangle((210,485,510,493),radius=4,fill=CYAN)
        centered(d,560,"ТВОЙ ПУТЬ НАЧИНАЕТСЯ ЗДЕСЬ",font(28,True),WHITE)
        rounded(d,(105,700,615,795),26,(18,58,67),outline=CYAN,width=2)
        centered(d,727,"НАЧНИ ОБУЧЕНИЕ СЕГОДНЯ",font(22,True),CYAN,0)
        centered(d,870,"ССЫЛКА В ШАПКЕ ПРОФИЛЯ",font(23,True),WHITE)
        centered(d,1060,"ARVEX  •  LEARN THE MARKET",font(16),MUTED)
def render_frame(t):
    im=base(t)
    spans=[(0,5),(5,9),(9,14),(14,20),(20,25),(25,30)]
    idx=next((i for i,(a,b) in enumerate(spans) if a<=t<b),5)
    a,b=spans[idx]
    scene(im,idx,t-a,t)
    # cinematic crossfade between scenes
    edge=0.42
    if idx>0 and t-a<edge:
        prev=Image.new("RGBA",(W,H),(*BG,255))
        scene(prev,idx-1,(spans[idx-1][1]-spans[idx-1][0])-(edge-(t-a)),t)
        im=Image.blend(prev,im,ease((t-a)/edge))
    # soft vignette
    return im.convert("RGB")
def main():
    out="ARVEX_2D_TikTok_Ad_60FPS.mp4"
    cmd=["ffmpeg","-y","-f","rawvideo","-vcodec","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart",out]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for n in range(TOTAL):
            p.stdin.write(render_frame(n/FPS).tobytes())
            if n%300==0: print(f"Rendered {n}/{TOTAL}",flush=True)
        p.stdin.close()
        if p.wait()!=0: raise RuntimeError("ffmpeg failed")
    except Exception:
        p.kill(); raise
    print(f"Created {out}: {W}x{H}, {FPS} fps, {DURATION}s")
if __name__=="__main__": main()
