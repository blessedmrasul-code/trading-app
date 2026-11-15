import math, os, subprocess
from PIL import Image, ImageDraw, ImageFont

W,H,FPS,DURATION=720,1280,24,78
OUT="two-futures.mp4"
def font(n,b=False):
    p="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if b else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(p,n)
def rr(d,b,r,fill,outline=None,w=1): d.rounded_rectangle(b,radius=r,fill=fill,outline=outline,width=w)
def center(d,xy,s,f,c): d.text(xy,s,font=f,fill=c,anchor="mm")
def char(im,x,y,s,coat,skin,t):
    d=ImageDraw.Draw(im); bob=math.sin(t*3)*5
    x=int(x);y=int(y+bob)
    d.ellipse((x-70*s,y+245*s,x+70*s,y+270*s),fill=(8,13,24))
    d.line((x-20*s,y+165*s,x-35*s,y+245*s),fill=(28,34,51),width=int(20*s))
    d.line((x+20*s,y+165*s,x+35*s,y+245*s),fill=(28,34,51),width=int(20*s))
    rr(d,(x-55*s,y+65*s,x+55*s,y+185*s),int(25*s),coat)
    d.line((x-42*s,y+95*s,x-72*s,y+165*s),fill=coat,width=int(23*s))
    d.line((x+42*s,y+95*s,x+72*s,y+165*s),fill=coat,width=int(23*s))
    d.ellipse((x-46*s,y-20*s,x+46*s,y+78*s),fill=skin)
    d.arc((x-46*s,y-26*s,x+46*s,y+55*s),180,355,fill=(25,23,28),width=int(15*s))
    d.ellipse((x-28*s,y+20*s,x-20*s,y+28*s),fill=(25,25,30))
    d.ellipse((x+20*s,y+20*s,x+28*s,y+28*s),fill=(25,25,30))
    d.arc((x-15*s,y+35*s,x+15*s,y+58*s),0,180,fill=(85,42,39),width=max(2,int(3*s)))
def scene(t):
    im=Image.new("RGB",(W,H),(13,21,38));d=ImageDraw.Draw(im)
    split=t<9 or 35<=t<41 or t>=68
    if split:
        d.rectangle((0,0,359,H),fill=(20,29,51));d.rectangle((360,0,W,H),fill=(22,37,44))
        d.line((360,0,360,H),fill=(95,120,143),width=3)
        center(d,(180,145),"ПРИВЫЧКА",font(25,True),(255,169,127))
        center(d,(540,145),"РАЗВИТИЕ",font(25,True),(99,235,200))
        char(im,180,560,1.0,(158,72,77),(225,175,140),t)
        char(im,540,560,1.0,(40,132,121),(203,153,119),t+1)
        if t<9:
            rr(d,(115,820,245,1010),18,(17,25,43),outline=(120,145,177),w=3);center(d,(180,910),"ЛЕНТА",font(24,True),"white")
            rr(d,(455,820,625,1010),18,(14,34,43),outline=(63,209,175),w=3);center(d,(540,875),"ПЛАН",font(27,True),(112,238,203));center(d,(540,930),"УЧЁБА",font(24,True),"white")
        elif t<41:
            center(d,(180,875),"ОЖИДАНИЕ",font(23,True),(255,176,134));center(d,(540,875),"24 ЧАСА",font(34,True),(105,239,202))
        else:
            center(d,(180,875),"СТАРЫЙ ПУТЬ",font(22,True),(255,176,134));center(d,(540,875),"НОВЫЕ РЕШЕНИЯ",font(20,True),(105,239,202))
    else:
        for i in range(7):
            xx=(i*150-int(t*20))%900-90;d.line((xx,190,xx+140,1080),fill=(30,52,75),width=2)
        char(im,360,550,1.25,(40,132,121),(203,153,119),t)
        if t<20:
            center(d,(360,240),"БЕЗ ПЛАНА",font(48,True),(255,168,126))
            rr(d,(295,820,425,1000),18,(17,25,43),outline=(130,150,180),w=3);center(d,(360,910),"ЛЕНТА",font(25,True),"white")
        elif t<35:
            center(d,(360,240),"ФИНАНСОВАЯ ГРАМОТНОСТЬ",font(31,True),(107,237,202))
            rr(d,(170,830,550,1000),20,(15,34,45),outline=(60,210,174),w=3);center(d,(360,880),"БЮДЖЕТ",font(33,True),(107,237,202));center(d,(360,945),"ЦЕЛИ • ЗНАНИЯ",font(24,True),"white")
        elif t<54:
            center(d,(360,240),"СНАЧАЛА — ЗНАНИЯ",font(39,True),(107,237,202))
            rr(d,(210,800,510,1000),18,(14,27,44),outline=(57,211,178),w=3)
            pts=[(235+i*30,930-math.sin(i*.8+t*.4)*30-i*5) for i in range(9)]
            d.line(pts,fill=(60,230,190),width=6)
        elif t<68:
            center(d,(360,240),"ОШИБКИ — ЭТО ОПЫТ",font(37,True),(255,177,132))
            rr(d,(180,830,540,1000),20,(38,31,45),outline=(230,157,103),w=3);center(d,(360,880),"АНАЛИЗ",font(33,True),(255,182,133));center(d,(360,945),"РИСКИ • ДИСЦИПЛИНА",font(22,True),"white")
        else: center(d,(360,240),"ТВОЙ ВЫБОР",font(52,True),(107,237,202))
    caps=[
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
    cap=next((s for a,b,s in caps if a<=t<b),"")
    rr(d,(35,1040,685,1190),22,(5,10,22),outline=(60,90,116),w=2)
    words=cap.split(); lines=[]; cur=""
    f=font(25,True)
    for word in words:
        test=(cur+" "+word).strip()
        if d.textbbox((0,0),test,font=f)[2]<=600:cur=test
        else:lines.append(cur);cur=word
    if cur:lines.append(cur)
    for i,line in enumerate(lines[:3]):center(d,(360,1080+i*38),line,f,(244,248,255))
    if t>=71:
        rr(d,(90,1140,630,1180),12,(20,111,96));center(d,(360,1160),"ПОДПИШИСЬ • УЧИСЬ • ДУМАЙ",font(20,True),"white")
    return im
def main():
    cmd=["ffmpeg","-y","-f","rawvideo","-vcodec","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-c:v","libx264","-preset","ultrafast","-crf","22","-pix_fmt","yuv420p","-movflags","+faststart",OUT]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for i in range(FPS*DURATION):p.stdin.write(scene(i/FPS).tobytes())
    p.stdin.close()
    if p.wait():raise RuntimeError("FFmpeg render failed")
    print("Rendered silent MP4:",OUT,os.path.getsize(OUT))
if __name__=="__main__":main()
