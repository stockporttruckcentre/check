"""Does what the workbook macro does, from Python, so the push can be tested
against the real files without Excel. Usage:
  python3 -I scripts/sheet-push-emulate.py stock|fleet <file.xlsx> <key file> [--dry]
It reads the same column list the macro reads (sheet_columns_for), sends only
those headers, and prints what the server answered."""
import sys, json, datetime, urllib.request, os
import openpyxl

URL = 'https://gqsecmqlhblyivoourkx.supabase.co/rest/v1/rpc/'
KEY = 'sb_publishable_1aEra9nrOSe_dT-nbZKnZQ_4k59Jzdx'

def rpc(name, body):
    req = urllib.request.Request(URL + name, data=json.dumps(body).encode(), method='POST',
        headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode() or 'null')

def text(v):
    if v is None: return ''
    if isinstance(v, (datetime.datetime, datetime.date)): return v.strftime('%Y-%m-%d')
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v).strip()

def main():
    source, path, keyfile = sys.argv[1], sys.argv[2], sys.argv[3]
    dry = '--dry' in sys.argv
    key = open(keyfile).read().strip()
    cols = rpc('sheet_columns_for', {'p_key': key, 'p_source': source})
    wanted = [(c['tab'].lower(), c['header'].lower()) for c in cols]
    first_key = 'stc no' if source == 'stock' else 'fleet number'
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    template = None
    rows = []
    sheets = []
    for ws in wb.worksheets:
        data = list(ws.iter_rows(values_only=True))
        hdr_at = None
        for i, r in enumerate(data[:15]):
            if any(text(c).lower() == first_key for c in r):
                hdr_at = i; break
        if hdr_at is not None:
            hdr = [text(c) for c in data[hdr_at]]
            if template is None: template = hdr
            body = data[hdr_at + 1:]
        elif source == 'stock' and template and any(text(r[0]).isdigit() and len(text(r[0])) in (5, 6, 7) for r in data if r):
            hdr = template; body = data   # a tab with no header row, laid out like the others
        else:
            continue
        sheets.append(ws.title)
        tab = ws.title.strip()
        for r in body:
            if not r or all(c in (None, '') for c in r): continue
            cells = {}
            for h, v in zip(hdr, r):
                if not h: continue
                hl = h.lower()
                if any((t == '*' or t == tab.lower()) and (hl == w or (hl.startswith(w) and not (hl[len(w)].isalpha() or hl[len(w)] == ' '))) for t, w in wanted):
                    if h not in cells: cells[h] = text(v)
            if cells: rows.append({'tab': tab, 'cells': cells})
    print('tabs read:', sheets)
    print('rows:', len(rows), 'bytes:', len(json.dumps(rows)))
    sent_headers = sorted({h for r in rows for h in r['cells']})
    print('headers sent:', sent_headers)
    if dry: return
    print(rpc('sheet_push', {'p_key': key, 'p_source': source, 'p_by': 'Test from the build', 'p_rows': rows}))

main()
