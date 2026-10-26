import re,sys
src=open(sys.argv[1],encoding='utf-8').read()
protos=[]
for m in re.finditer(r'^((?:static\s+)?(?:inline\s+)?(?:void|bool|int|long|String)\s+\w+\s*\([^)]*\))\s*\{',src,re.M):
    protos.append(m.group(1).replace('\n',' ')+';')
lines=src.split('\n'); last=max(i for i,l in enumerate(lines) if l.startswith('#include'))
lines.insert(last+1,'\n'.join(protos)+'\n')
open(sys.argv[2],'w',encoding='utf-8').write('\n'.join(lines))
