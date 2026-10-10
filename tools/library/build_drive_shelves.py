import json, re, collections, sys
import os
HERE=os.path.dirname(os.path.abspath(__file__))
REPO=os.path.dirname(os.path.dirname(HERE))
D=os.path.join(HERE,'catalog')+'/'
a=json.load(open(D+'doctrinal-biblestudy.json'))+json.load(open(D+'evangelism-audio.json'))
FOLD=json.load(open(D+'folder_ids.json')); COLL=set(json.load(open(D+'collections.json')))
MEDIA=lambda m: m.startswith('audio/') or m.startswith('video/')
SKIP=lambda m: m.startswith('image/') or m in ('application/vnd.google-apps.form','application/octet-stream')

def kw(t, rules, default):
    s=t.lower()
    for pat, shelf in rules:
        if re.search(pat, s): return shelf
    return default

DEVO = [
 (r'new evangelical|neo-evangel|charismatic|ecumen|calvin|catholic|romanis|apostas|heres|emerging|contemporary christian|\bccm\b|false|cult|mormon|jehovah|purpose driven|rock music|hyles|ruckman|pentecost|tongues|keswick', 'False Doctrine'),
 (r'music|hymn|song|singing', 'Music'),
 (r'baptism|lord.s supper|communion', 'Ordinances'),
 (r'church discipline|church|pastor|deacon|membership|members|elder', 'The Church'),
 (r'evangeli[sz]|soul.?win|gospel|witness|the lost|tract|missionar|great commission', 'Evangelism'),
 (r'prophec|rapture|tribulation|end times|antichrist|second coming|laodicea', 'Prophecy'),
 (r'marriage|husband|wife|wives|children|child|home|family|father|mother|masculin|feminin|parent', 'Family'),
 (r'preach|sermon|teaching|teacher', 'Pastoral'),
 (r'separat|worldl|modest|dress|standard|carnal|entertainment|television|alcohol|tattoo', 'Christian Living'),
 (r'creation|evolution|\bscience|darwin', 'Apologetics'),
 (r'bible version|king james|\bkjv\b|\bniv\b|preserv', 'Bible Preservation'),
 (r'history|baptists? (?:in|of)|anabaptist|reformation', 'History'),
]
BSROOT = {
 'Archaeological Validation of the Bible, OT & NT':'Apologetics', "The Bible's Proof":'Apologetics', 'Bible Proofs in Daniel':'Apologetics',
 'The Doctrine Which Ye have learned':'Doctrine', 'An Essay on The Trinity':'Doctrine', 'The Seven Churches of Revelation':'Prophecy',
}
VERS = r'nkjv|\bniv\b|nasb|nasv|living bible|modern (?:bible|version)|versions|dynamic equivalenc|new american standard|hall of shame|new king james'

def shelf_for(path, title):
    seg=[s.strip() for s in path.split(' / ')]
    root, rest = seg[0], seg[1:]
    top = rest[0] if rest else ''
    sub = rest[1] if len(rest)>1 else ''
    p=' / '.join(rest)
    if root=='TNBC Doctrinal Resources':
        if top=='Alcohol': return 'Christian Living'
        if top=='Baptist Distinctives': return 'The Church'
        if top=='Bible Preservation': return 'Bible Versions' if re.search(VERS, title.lower()) else 'Bible Preservation'
        if top=='Children & Family': return 'Family'
        if top=='Christian Apparel': return 'Christian Living'
        if top=='Devotional Archive': return kw(title, DEVO, 'Devotional')
        if top=='End Times': return 'Prophecy'
        if top=='Evangelism': return 'Evangelism'
        if top=='False Doctrine & Religion':
            if sub=='Evolution' or title.startswith('Defense of the Faith'): return 'Apologetics'
            return 'False Doctrine'
        if top in ('Repentance','Salvation','Sanctification'): return 'Doctrine'
        if top=='Separation': return 'Christian Living'
        if top=='Sacred Music': return 'Music'
        if top=='The Church':
            if sub in ('Baptism',"The Lord's Supper"): return 'Ordinances'
            if sub=='Church History': return 'History'
            if sub=='Preaching/Teaching': return 'Pastoral'
            return 'The Church'
    if root=='TNBC Bible Study Resources':
        if not top: return BSROOT.get(title, 'Study & Reference')
        if top=='Bible Book Studies':
            if 'Out of the Fire' in p: return 'False Doctrine'
            if 'OT Survey' in p or title in ('Bible King James Version','Genesis to Revelation Course'): return 'Study & Reference'
            return 'Commentaries & Dictionaries'
        if top=='Commentaries': return 'Commentaries & Dictionaries'
        if top=='Studies for New Believers': return 'Christian Living'
        return 'Study & Reference'
    if root=='TNBC Evangelism Resources':
        if title.startswith('Scriptural Church Study Outlines'): return 'The Church'
        return 'Evangelism'
    if root=='TNBC Audio Library':
        if top=='KJV Audio Bible': return 'Study & Reference'
        if top in ('Sacred Music Collection','Song Leading','TNBC Choir'): return 'Music'
        if top=='Stories for Children': return "Children's Books"
        if top=='Spanish Practice': return 'General'
        return 'Christian Living'
    raise Exception(path)

def clean(t):
    t=re.sub(r'\.(pdf|docx?|pptx?|mp3|mp4|mkv|m4a|wav)$','',t.strip(),flags=re.I)
    t=t.replace('_',' ')
    t=re.sub(r'\s+',' ',t).strip()
    return t
def kind(m):
    if m=='application/pdf': return 'p'
    if 'wordprocessing' in m or m=='application/msword': return 'w'
    if 'presentation' in m: return 's'
    if m=='application/vnd.google-apps.document': return 'g'
    if m.startswith('audio/'): return 'a'
    if m.startswith('video/'): return 'v'
    return 'p'
def label(path, drop_last=False):
    seg=[s.strip() for s in path.split(' / ')]
    root={'TNBC Doctrinal Resources':'Doctrinal','TNBC Bible Study Resources':'Bible Study','TNBC Evangelism Resources':'Evangelism','TNBC Audio Library':'Audio Library'}[seg[0]]
    rest=seg[1:-1] if drop_last else seg[1:]
    rest=[re.sub(r'\s*\(Do not delete!\)','',r) for r in rest]
    return ' › '.join([root]+rest)

items=[]; seen=set(); skipped=collections.Counter()
# collections first
for path in sorted(COLL):
    fs=[x for x in a if x['path']==path]
    med=[x for x in fs if MEDIA(x['mime'])]
    name=path.split(' / ')[-1]
    vid=sum(1 for x in med if x['mime'].startswith('video/'))
    items.append({'t':name.strip(),'s':shelf_for(path, name.strip()),'k':'c','id':FOLD[name],'l':label(path,True),'n':len(med),'vid':vid>len(med)/2})
for x in a:
    if SKIP(x['mime']): skipped[x['mime']]+=1; continue
    if x['path'] in COLL and MEDIA(x['mime']): continue
    t=clean(x['title'])
    s=shelf_for(x['path'], t)
    items.append({'t':t,'s':s,'k':kind(x['mime']),'id':x['id'],'l':label(x['path'])})
# dedupe by normalized title + kind; prefer non-Devotional-Archive
def norm(t): return re.sub(r'[^a-z0-9]','',t.lower())
items.sort(key=lambda i: ('Devotional' in i['l'], i['l']))
out=[]; dup=0
for i in items:
    k=(norm(i['t']), i['k'] if i['k']!='c' else 'c')
    if k in seen: dup+=1; continue
    seen.add(k); out.append(i)
json.dump(out, open(D+'shelf_items.json','w'), ensure_ascii=False)
c=collections.Counter(i['s'] for i in out)
print('items',len(out),'dups dropped',dup,'skipped',dict(skipped))
for s,n in c.most_common(): print(f'{n:5} {s}')
print(collections.Counter(i['k'] for i in out))

# --- the 24 hand-picked documents -------------------------------------------
import subprocess
sel=json.loads(subprocess.check_output(['node','-e','const fs=require("fs");const c={};new Function(fs.readFileSync("'+REPO+'/docs/js/library-data.js","utf8")+";Object.assign(this,{digitalLibrary})").call(c);console.log(JSON.stringify(c.digitalLibrary))']))
SEL_SHELF=['Study & Reference','Study & Reference','Pastoral','Pastoral','Pastoral','Doctrine','Doctrine','Bible Preservation','Apologetics','Apologetics','Apologetics','Commentaries & Dictionaries','Bible Preservation','Bible Preservation','Bible Versions','Bible Preservation','Bible Preservation','History','Commentaries & Dictionaries','Commentaries & Dictionaries','Commentaries & Dictionaries','Commentaries & Dictionaries','Study & Reference','Study & Reference']
byid={i['id']:i for i in out}
bytitle={norm(i['t']):i for i in out if i['k']!='c'}
merged=added=0
for d,s in zip(sel,SEL_SHELF):
    m=re.search(r'/d/([^/]+)', d['url']); fid=m.group(1)
    hit=byid.get(fid) or bytitle.get(norm(d['title']))
    if hit:
        hit['c']=sorted(set(hit.get('c',[]))|set(d['courseIds'])); hit.setdefault('note', d['topic']); merged+=1; continue
    out.append({'t':d['title'],'s':s,'k':'g' if '/document/d/' in d['url'] else 'p','id':fid,'l':'Institute course documents','c':d['courseIds'],'note':d['topic'],'a':d.get('author') or ''})
    added+=1
print('selected: merged',merged,'added',added,'total',len(out))
json.dump(out, open(D+'shelf_items.json','w'), ensure_ascii=False)

# --- the site's data file ------------------------------------------------------
labels=sorted({i['l'] for i in out})
li={l:n for n,l in enumerate(labels)}
rows=[]
for i in sorted(out, key=lambda i:(i['s'], i['t'].lower())):
    r=[i['t'], i['s'], i['k'], i['id'], li[i['l']]]
    extra=[i.get('n',0), ','.join(i.get('c',[])), i.get('note',''), i.get('a',''), 1 if i.get('vid') else 0]
    while extra and not extra[-1]: extra.pop()
    rows.append(r+extra)
js = ("// Every document, recording and album in the church's linked Google Drive\n"
      "// folders (Doctrinal, Bible Study, Evangelism, Audio Library) plus the\n"
      "// Institute's hand-picked course documents, each placed on a library shelf.\n"
      "// GENERATED by tools/library/build_drive_shelves.py from a read-only walk of\n"
      "// the Drive (Oct 10, 2026). Images, Google Forms quizzes and exact duplicates\n"
      "// are left out; an album or a numbered recorded series is one entry that opens\n"
      "// its folder.\n"
      "// Row: [title, shelf, kind, driveId, labelIndex, count, courseIds, note, author, isVideo]\n"
      "// kind: p PDF · w Word · s slides · g Google Doc · a audio · v video · c collection (folder)\n"
      "const DRIVE_LABELS = " + json.dumps(labels, ensure_ascii=False) + ";\n"
      "const DRIVE_ITEMS = [\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n];\n")
open(REPO+'/docs/js/drive-library.js','w').write(js)
print('wrote', len(js), 'bytes,', len(rows), 'rows,', len(labels), 'labels')
