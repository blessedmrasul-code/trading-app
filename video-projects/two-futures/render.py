import math, os, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Two contrasting lives — premium editorial motion design.
BASE_W, BASE_H = 720, 1280
S = 1.5
W, H = int(BASE_W*S), int(BASE_H*S)
FPS, DURATION = 60, 78
OUT = "two-futures.mp4"
WHITE=(245,248,255); MUTED=(157,171,192); MINT=(89,231,185)
CORAL=(255,145,125); GOLD=(245,194,104)

def q(v): return int(v*S)
def b(v): return tuple(q(x) for x in v)
def font(n,bold=False):
    p="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(p,q(n))
def rounded(d,xy,r,fill,outline=None,width=1):
    d.rounded_rectangle(b(xy),radius=q(r),fill=fill,outline=outline,width=q(width))
def txt(d,xy,s,n,color=WHITE,bold=False,anchor="mm"):
    d.text((q(xy[0]),q(xy[1])),s,font=font(n,bold),fill=color,anchor=anchor)
def line(d,xy,color,width=1):
    d.line([(q(x),q(y)) for x,y in xy],fill=color,width=q(width),joint="curve")
def glow(im,cx,cy,r,color,alpha):
    lay=Image.new("RGBA",(W,H),(0,0,0,0)); z=ImageDraw.Draw(lay)
    z.ellipse(b((cx-r,cy-r,cx+r,cy+r)),fill=(*color,alpha))
    lay=lay.filter(ImageFilter.GaussianBlur(q(r*.42)))
    return Image.alpha_composite(im.convert("RGBA"),lay).convert("RGB")

def make_bg(kind,t):
    palettes={
      "poor":((29,25,31),(9,12,20),(175,91,73)),
      "rich":((18,34,48),(5,13,24),(49,170,142)),
      "street":((34,28,40),(8,12,24),(202,104,84)),
      "market":((11,25,39),(5,12,23),(40,135,119)),
      "neutral":((18,25,39),(7,13,24),(74,112,137)),
      "final":((13,30,39),(5,13,24),(66,194,153))}
    top,bot,accent=palettes[kind]
    im=Image.new("RGB",(W,H)); px=im.load()
    for y in range(H):
        a=y/(H-1)
        c=tuple(int(top[i]*(1-a)+bot[i]*a) for i in range(3))
        for x in range(W): px[x,y]=c
    drift=math.sin(t*.45)*35
    im=glow(im,555+drift,260,245,accent,32)
    im=glow(im,100-drift,850,210,accent,13)
    d=ImageDraw.Draw(im)
    # architectural depth: window mullions and subtle floor perspective
    if kind in ("poor","rich","street"):
        wall=(35,43,55) if kind!="poor" else (56,48,49)
        d.rectangle(b((0,0,720,720)),outline=wall,width=q(2))
        if kind=="poor":
            rounded(d,(430,145,665,540),5,(18,23,32),outline=(83,72,69),width=4)
            line(d,[(548,145),(548,540)],(67,64,67),3)
            line(d,[(430,340),(665,340)],(67,64,67),3)
        else:
            rounded(d,(395,100,685,565),8,(12,28,42),outline=(59,91,105),width=3)
            line(d,[(540,100),(540,565)],(43,72,85),2)
            line(d,[(395,330),(685,330)],(43,72,85),2)
        line(d,[(0,760),(720,760)],(46,54,67),2)
        line(d,[(0,1040),(720,1040)],(30,39,52),2)
    else:
        for x in range(50,720,90):
            line(d,[(x,120),(x,1020)],(24,40,55),1)
        for y in range(220,1050,100):
            line(d,[(20,y),(700,y)],(24,40,55),1)
    return im

def person(d,cx,cy,scale,coat,skin,mood="neutral",pose=0):
    bob=math.sin(pose*2.4)*2
    x,y=cx,cy+bob
    # shadow, legs, shoes
    d.ellipse(b((x-72*scale,y+220*scale,x+72*scale,y+240*scale)),fill=(4,8,15))
    rounded(d,(x-32*scale,y+145*scale,x-7*scale,y+235*scale),10,(35,43,57))
    rounded(d,(x+7*scale,y+145*scale,x+32*scale,y+235*scale),10,(35,43,57))
    rounded(d,(x-46*scale,y+222*scale,x-2*scale,y+242*scale),8,(12,18,29))
    rounded(d,(x+2*scale,y+222*scale,x+46*scale,y+242*scale),8,(12,18,29))
    # torso, neck, head
    rounded(d,(x-53*scale,y+48*scale,x+53*scale,y+177*scale),22,coat)
    rounded(d,(x-14*scale,y+27*scale,x+14*scale,y+65*scale),7,skin)
    d.ellipse(b((x-44*scale,y-43*scale,x+44*scale,y+55*scale)),fill=skin)
    d.pieslice(b((x-47*scale,y-50*scale,x+47*scale,y+38*scale)),180,360,fill=(30,27,31))
    d.ellipse(b((x-42*scale,y-18*scale,x-28*scale,y+9*scale)),fill=(30,27,31))
    d.ellipse(b((x-22*scale,y+4*scale,x-16*scale,y+10*scale)),fill=(35,29,31))
    d.ellipse(b((x+16*scale,y+4*scale,x+22*scale,y+10*scale)),fill=(35,29,31))
    if mood=="sad": line(d,[(x-10*scale,y+32*scale),(x+10*scale,y+32*scale)],(105,57,53),2)
    else: d.arc(b((x-13*scale,y+15*scale,x+13*scale,y+36*scale)),5,170,fill=(112,65,55),width=q(2*scale))
    # arms change position slightly
    line(d,[(x-42*scale,y+78*scale),(x-68*scale,y+145*scale)],coat,22*scale)
    line(d,[(x+42*scale,y+78*scale),(x+67*scale,y+142*scale)],coat,22*scale)
    d.ellipse(b((x-78*scale,y+138*scale,x-59*scale,y+158*scale)),fill=skin)
    d.ellipse(b((x+58*scale,y+135*scale,x+77*scale,y+155*scale)),fill=skin)

def phone(d,x,y,amount,poor=True):
    rounded(d,(x-49,y-88,x+49,y+88),17,(5,9,16),outline=(112,123,137),width=3)
    rounded(d,(x-40,y-69,x+40,y+67),10,(22,31,43),outline=(43,57,73))
    txt(d,(x,y-36),"BALANCE",10,MUTED,True)
    txt(d,(x,y+3),amount,24,CORAL if poor else MINT,True)
    txt(d,(x,y+43),"€",13,WHITE,True)
    rounded(d,(x-12,y-80,x+12,y-76),2,(100,111,124))

def laptop(d,x,y,wealth=False):
    rounded(d,(x-118,y-88,x+118,y+67),12,(5,10,18),outline=(112,132,151),width=3)
    rounded(d,(x-106,y-76,x+106,y+55),6,(12,28,43),outline=(37,66,82))
    txt(d,(x,y-54),"PORTFOLIO",11,MUTED,True)
    values=["$10,000","$50,000","$100,000","$1,000,000"]
    val=values[min(3,max(0,int(wealth)))] if isinstance(wealth,(int,float)) else "$0"
    txt(d,(x,y-20),val,25,MINT if val!="$0" else CORAL,True)
    # rising chart with controlled clean segments
    pts=[(x-82,y+35),(x-48,y+22),(x-18,y+28),(x+15,y+4),(x+48,y-3),(x+82,y-35)]
    line(d,pts,MINT if val!="$0" else CORAL,3)
    d.polygon(b([(x-130,y+67),(x+130,y+67),(x+158,y+83),(x-158,y+83)]),fill=(82,94,108))
    line(d,[(x-130,y+67),(x+130,y+67)],(155,169,183),2)

def cash_card(d,x,y,value,label,color):
    rounded(d,(x-120,y-58,x+120,y+58),18,(16,29,43),outline=color,width=2)
    txt(d,(x,y-12),value,30,color,True)
    txt(d,(x,y+29),label,12,MUTED,True)

def scene(t):
    # 13 compact chapters; each scene is composed independently and cross-faded.
    specs=[
      ("poor","НЕТ ПЛАНА","Утро начинается с бесконечной ленты", "poor_phone"),
      ("street","ДЕНЬГИ УХОДЯТ","Покупки и импульсивные решения", "spend"),
      ("poor","$0 НА СЧЁТЕ","Доходы закончились раньше месяца", "zero"),
      ("rich","ДРУГОЙ ВЫБОР","Тот же день — другие привычки", "desk"),
      ("market","СНАЧАЛА ОБУЧЕНИЕ","Он изучает рынок и основы финансов", "study"),
      ("rich","АНАЛИЗ, А НЕ УГАДЫВАНИЕ","План, графики и контроль риска", "chart"),
      ("market","$10 000","Первый ориентир — капитал и дисциплина", "money0"),
      ("market","$50 000","Путь состоит из решений и времени", "money1"),
      ("rich","$100 000","Результаты не приходят по щелчку", "money2"),
      ("final","$1 000 000","Это иллюстрация цели, не обещание прибыли", "money3"),
      ("neutral","ОШИБКИ БЫВАЮТ","Важно анализировать и управлять риском", "risk"),
      ("rich","НЕ СЕКРЕТ, А ПРИВЫЧКИ","Знания. Терпение. Последовательность.", "habits"),
      ("final","ТВОЁ БУДУЩЕЕ — ТВОЙ ВЫБОР","Начни с решений, которые принимаешь сегодня", "end")]
    idx=min(len(specs)-1,int(t/6))
    local=(t-idx*6)/6
    return idx,local,specs[idx]

def draw_scene(t):
    idx,u,spec=scene(t); kind,title,sub,mode=spec
    im=make_bg(kind,t); d=ImageDraw.Draw(im)
    # Scene title and subtitle, with breathing room for the voice-over.
    txt(d,(360,145),title,29 if len(title)>22 else 38,MINT if kind in ("rich","market","final") else CORAL,True)
    txt(d,(360,205),sub,15,MUTED,False)
    # small moving light marker to give each shot a sense of motion
    px=90+540*u
    rounded(d,(80,245,640,249),2,(38,53,68))
    rounded(d,(80,245,80+560*u,249),2,MINT if kind!="poor" else CORAL)
    if mode=="poor_phone":
        person(d,250,525,1.02,(112,65,72),(218,169,139),"sad",t)
        phone(d,500,650,"$0",True)
        rounded(d,(80,880,640,1010),18,(22,27,39),outline=(91,66,67))
        txt(d,(360,920),"ЕЩЁ ОДИН ЧАС В ЛЕНТЕ",18,WHITE,True)
        txt(d,(360,965),"ВРЕМЯ УХОДИТ",14,CORAL,True)
    elif mode=="spend":
        person(d,245,530,1.0,(132,69,75),(218,169,139),"sad",t)
        # shopping bags / receipts
        rounded(d,(390,600,510,770),12,(104,69,65),outline=(183,128,102),width=3)
        line(d,[(415,600),(415,565),(485,565),(485,600)],(183,128,102),4)
        txt(d,(450,685),"SALE",22,WHITE,True)
        cash_card(d,360,920,"−€250","ИМПУЛЬСИВНЫЕ ТРАТЫ",CORAL)
    elif mode=="zero":
        person(d,240,540,1.0,(112,65,72),(218,169,139),"sad",t)
        phone(d,500,650,"$0",True)
        cash_card(d,360,925,"$0","НЕТ ФИНАНСОВОЙ ПОДУШКИ",CORAL)
    elif mode=="desk":
        # rich home office with warm interior, desk and window
        rounded(d,(80,690,640,930),18,(37,48,57),outline=(89,116,124),width=2)
        person(d,250,470,.9,(35,119,104),(204,158,128),"happy",t)
        laptop(d,480,730,0)
        rounded(d,(105,950,615,1040),16,(15,43,43),outline=(48,132,109))
        txt(d,(360,995),"РАБОЧЕЕ МЕСТО • ПЛАН • ЦЕЛИ",16,MINT,True)
    elif mode=="study":
        person(d,240,490,.95,(35,119,104),(204,158,128),"happy",t)
        rounded(d,(390,520,620,825),15,(10,22,36),outline=(55,107,115),width=2)
        txt(d,(505,565),"ОБУЧЕНИЕ",16,MINT,True)
        for j,w in enumerate((145,185,120,165)):
            rounded(d,(420,610+j*43,420+w,623+j*43),5,(52,133,119))
        txt(d,(360,940),"ФИНАНСОВАЯ ГРАМОТНОСТЬ",18,WHITE,True)
    elif mode=="chart":
        laptop(d,360,670,0)
        # separate analytical dashboard
        rounded(d,(90,830,630,1040),16,(11,25,40),outline=(49,85,101),width=2)
        txt(d,(360,865),"АНАЛИТИКА РЫНКА",15,MUTED,True)
        for j in range(4):
            y=910+j*28
            line(d,[(125,y),(595,y)],(31,54,70),1)
        line(d,[(130,1000),(205,975),(275,987),(350,940),(430,950),(510,900),(585,884)],MINT,4)
        txt(d,(360,1020),"СТОП-ЛОСС • РИСК • ПЛАН",13,MINT,True)
    elif mode.startswith("money"):
        n=int(mode[-1])
        person(d,170,500,.8,(35,119,104),(204,158,128),"happy",t)
        laptop(d,470,675,n+1)
        cash_card(d,360,940,("$10 000","$50 000","$100 000","$1 000 000")[n],"ИЛЛЮСТРАЦИЯ ФИНАНСОВОЙ ЦЕЛИ",GOLD if n==3 else MINT)
        # soft ascending bars, not a fabricated live trading chart
        for j,h in enumerate((70,115,165,220)):
            rounded(d,(105+j*125,1120-h,185+j*125,1120),8,(25,83+j*17,76+j*10))
    elif mode=="risk":
        rounded(d,(80,420,640,940),22,(17,27,42),outline=(95,87,77),width=2)
        txt(d,(360,490),"ПЕРЕД РЕШЕНИЕМ",20,GOLD,True)
        for j,label in enumerate(("ОЦЕНИТЬ РИСК","ОПРЕДЕЛИТЬ ЛИМИТ","ПРИНЯТЬ ВОЗМОЖНОСТЬ УБЫТКА")):
            rounded(d,(125,565+j*105,595,630+j*105),12,(34,43,55),outline=(91,83,74))
            txt(d,(360,598+j*105),label,16,WHITE,True)
    elif mode=="habits":
        person(d,230,510,.9,(35,119,104),(204,158,128),"happy",t)
        laptop(d,485,680,2)
        for j,(v,l) in enumerate((("01","ЗНАНИЯ"),("02","ДИСЦИПЛИНА"),("03","ТЕРПЕНИЕ"))):
            cash_card(d,360,900+j*88,v,l,MINT)
    else:
        person(d,360,510,1.05,(35,119,104),(204,158,128),"happy",t)
        rounded(d,(90,850,630,1035),20,(14,45,42),outline=(56,151,119),width=2)
        txt(d,(360,900),"УЧИСЬ • АНАЛИЗИРУЙ • ДЕЙСТВУЙ",18,MINT,True)
        txt(d,(360,970),"ПОДПИСЫВАЙСЯ НА ARVEX",22,WHITE,True)
    # persistent discreet scene counter
    txt(d,(360,1190),"ARVEX  /  FINANCIAL MINDSET",12,(114,137,158),True)
    return im

def frame(t,cache):
    idx,u,_=scene(t)
    current=draw_scene(t)
    # Smooth 0.7-second crossfade at every chapter boundary.
    fade=.72
    if idx>0 and u<fade/6:
        prev_t=max(0,t-.001)
        prev=cache.get(idx-1)
        if prev is None:
            prev=draw_scene(max(0,idx*6-.01)); cache[idx-1]=prev
        alpha=max(0,min(1,(u*6)/fade))
        current=Image.blend(prev,current,alpha)
    return current

def main():
    cmd=["ffmpeg","-y","-f","rawvideo","-vcodec","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-c:v","libx264","-preset","veryfast","-crf","19","-pix_fmt","yuv420p","-movflags","+faststart",OUT]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    cache={}
    try:
        for i in range(FPS*DURATION):
            p.stdin.write(frame(i/FPS,cache).tobytes())
    finally:
        p.stdin.close()
    if p.wait(): raise RuntimeError("FFmpeg render failed")
    print("Rendered silent Full HD MP4:",OUT,os.path.getsize(OUT))

if __name__=="__main__": main()
