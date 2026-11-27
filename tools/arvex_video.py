from pathlib import Path
import subprocess, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
OUT=Path("output"); OUT.mkdir(exist_ok=True); W,H=720,1280
font="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
def F(s): return ImageFont.truetype(font,s)
def scene(i):
 im=Image.new("RGB",(W,H),(9,8,19)); d=ImageDraw.Draw(im)
 # layered neon backdrop
 for y in range(H):
  c=int(14+20*math.sin(y/H*math.pi)); d.line((0,y,W,y),fill=(c//2,c//3,c))
 for x in range(25,W,90): d.line((x,0,x,H),fill=(23,20,40),width=1)
 for y in range(40,H,90): d.line((0,y,W,y),fill=(23,20,40),width=1)
 # glowing chart strokes
 points=[(40,700),(130,630),(205,720),(280,530),(350,580),(430,430),(520,480),(610,300),(680,360)]
 for p,q in zip(points,points[1:]): d.line((p,q),fill=(164,75,255),width=6)
 for x,y in points: d.ellipse((x-8,y-8,x+8,y+8),fill=(207,160,255))
 # anime-style teen silhouette, hoodie and head
 d.ellipse((230,430,490,700),fill=(19,17,31),outline=(145,74,236),width=5)
 d.polygon([(200,670),(520,670),(620,1050),(100,1050)],fill=(23,20,39),outline=(125,70,230))
 d.ellipse((285,390,440,575),fill=(218,175,148),outline=(230,175,255),width=3)
 d.polygon([(285,425),(300,375),(350,390),(415,370),(448,425),(420,445),(390,430),(350,448)],fill=(23,18,30))
 d.line((320,490,355,490),fill=(30,20,30),width=6); d.line((390,490,415,490),fill=(30,20,30),width=6)
 d.arc((345,515,390,550),0,180,fill=(60,25,40),width=4)
 titles=["ПЕРВЫЙ ШАГ","НЕ ПОНЯТНО?","УЧИСЬ И ПРАКТИКУЙ","СИМУЛЯТОР ARVEX"]
 subtitles=["Рынок кажется сложным","Графики. Ошибки. Сомнения.","Виртуальные сделки — без риска","Обучение с нуля"]
 d.text((40,90),titles[i],font=F(40),fill=(235,220,255),stroke_width=2,stroke_fill=(65,30,110))
 d.text((40,155),subtitles[i],font=F(27),fill=(180,150,230))
 if i==1: d.text((45,250),"?",font=F(120),fill=(255,75,90))
 if i==2: d.text((45,250),"10 000$",font=F(46),fill=(170,255,190))
 return im
clips=[]
for i in range(4):
 p=OUT/f"scene{i}.png"; scene(i).save(p); clips.append(p)
def run(a): subprocess.run(a,check=True)
parts=[]
for i,p in enumerate(clips):
 v=OUT/f"part{i}.mp4"
 # subtle animated push
 run(["ffmpeg","-y","-loop","1","-i",str(p),"-t","6","-vf",f"zoompan=z='min(1.0+0.0015*on,1.09)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=720x1280:fps=30,format=yuv420p","-c:v","libx264","-preset","veryfast","-crf","23",str(v)])
 parts.append(v)
# six-second animated brand card
p=OUT/"card.mp4"
vf="drawtext=fontfile="+font+":text='ARVEX':fontcolor=white:fontsize=108:x=(w-text_w)/2:y=480,drawtext=fontfile="+font+":text='Торгуй. Развивайся. Побеждай.':fontcolor=0xB99AFF:fontsize=26:x=(w-text_w)/2:y=650,drawtext=fontfile="+font+":text='Начни обучение с ARVEX':fontcolor=white:fontsize=29:x=(w-text_w)/2:y=745"
run(["ffmpeg","-y","-f","lavfi","-i","color=c=#090711:s=720x1280:r=30:d=6","-vf",vf,"-c:v","libx264","-pix_fmt","yuv420p",str(p)])
parts.append(p)
lst=OUT/"concat.txt"; lst.write_text("\n".join("file '"+str(x.resolve())+"'" for x in parts)+"\n")
run(["ffmpeg","-y","-f","concat","-safe","0","-i",str(lst),"-vf","fps=30,format=yuv420p","-c:v","libx264","-preset","veryfast","-crf","22","-movflags","+faststart",str(OUT/"ARVEX-30s-720p.mp4")])
print("VIDEO READY", (OUT/"ARVEX-30s-720p.mp4").stat().st_size)
