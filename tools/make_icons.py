from PIL import Image, ImageDraw, ImageFilter
import math, os, sys
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
BG=(7,11,18); GRID=(34,50,78); CY=(45,226,200)
def draw(size, safe=1.0):
    S=size*4
    im=Image.new("RGB",(S,S),BG); d=ImageDraw.Draw(im)
    m=S*(1-safe)/2; W=S-2*m
    step=W/8
    for i in range(1,8):
        d.line([(m+i*step,m),(m+i*step,S-m)],fill=GRID,width=max(2,S//200))
        d.line([(m,m+i*step),(S-m,m+i*step)],fill=GRID,width=max(2,S//200))
    d.line([(m,S/2),(S-m,S/2)],fill=(58,77,107),width=max(3,S//150))
    pts=[]
    n=1600
    for k in range(n+1):
        x=m+W*0.06+(W*0.88)*k/n
        y=S/2-math.sin(2*math.pi*1.5*k/n)*W*0.27
        pts.append((x,y))
    glow=Image.new("RGB",(S,S),(0,0,0)); g=ImageDraw.Draw(glow)
    rg=S*0.0375
    for (x,y) in pts: g.ellipse([x-rg,y-rg,x+rg,y+rg],fill=CY)
    glow=glow.filter(ImageFilter.GaussianBlur(S*0.03))
    im=Image.blend(im,Image.composite(glow,im,glow.convert("L").point(lambda v:255 if v>8 else 0)),0.0) if False else im
    from PIL import ImageChops
    im=ImageChops.add(im,glow.point(lambda v:int(v*0.55)))
    d=ImageDraw.Draw(im)
    rm=S*0.0225
    for (x,y) in pts: d.ellipse([x-rm,y-rm,x+rm,y+rm],fill=CY)
    r=S*0.03
    d.ellipse([pts[-1][0]-r*1.4,pts[-1][1]-r*1.4,pts[-1][0]+r*1.4,pts[-1][1]+r*1.4],fill=(255,200,87))
    return im.resize((size,size),Image.LANCZOS)
draw(192).save(out+"/icon-192.png"); draw(512).save(out+"/icon-512.png")
draw(512,0.78).save(out+"/maskable-512.png"); draw(180).save(out+"/apple-touch-icon.png")
print("icons ok")
