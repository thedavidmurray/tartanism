#!/usr/bin/env python3
"""Stage Tartanism 1.0 metadata, one real simulator screenshot and VALID build 7.
No review-submission endpoint is callable here. Safe to retry after partial success.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import jwt

BASE='https://api.appstoreconnect.apple.com'
APP='6826004437'
ROOT=Path(__file__).resolve().parents[1]
SHOT=ROOT/'fastlane/screenshots/en-US/iPhone 16 Pro Max-01.png'

def request(method,path,payload=None):
    assert path.startswith('/v1/')
    assert (method,path.split('/')[2]) not in {('POST','reviewSubmissions'),('POST','appStoreVersionSubmissions')}
    now=int(time.time())
    token=jwt.encode({'iss':os.environ['ASC_ISSUER_ID'],'iat':now,'exp':now+300,'aud':'appstoreconnect-v1'},
        Path(os.environ['ASC_API_KEY_PATH']).read_text(),algorithm='ES256',
        headers={'kid':os.environ['ASC_KEY_ID'],'typ':'JWT'})
    req=urllib.request.Request(BASE+path,data=json.dumps(payload).encode() if payload is not None else None,
        method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=90) as response:
            data=response.read()
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as e:
        errors=json.loads(e.read()).get('errors',[])
        raise RuntimeError(f'{method} {path}: HTTP {e.code}: '+str([(x.get('code'),x.get('title'),x.get('detail')) for x in errors])) from None

def items(path):
    result=request('GET',path)
    if result.get('links',{}).get('next'):
        raise RuntimeError('Pagination unexpected for scoped lookup')
    return result['data']

def rel(kind,id):
    return {'data':{'type':kind,'id':id}}

version=next(x for x in items(f'/v1/apps/{APP}/appStoreVersions') if x['attributes']['versionString']=='1.0')
vid=version['id']
assert version['attributes']['appStoreState']=='PREPARE_FOR_SUBMISSION'
local=next(x for x in items(f'/v1/appStoreVersions/{vid}/appStoreVersionLocalizations') if x['attributes']['locale']=='en-US')
lid=local['id']
if local['attributes'].get('marketingUrl')!='https://edgelesslab.com':
    request('PATCH',f'/v1/appStoreVersionLocalizations/{lid}', {'data':{'type':'appStoreVersionLocalizations','id':lid,'attributes':{'marketingUrl':'https://edgelesslab.com'}}})
    print('Marketing URL corrected to live homepage')
sets=items(f'/v1/appStoreVersionLocalizations/{lid}/appScreenshotSets')
sett=next((x for x in sets if x['attributes']['screenshotDisplayType']=='APP_IPHONE_67'),None)
if not sett:
    sett=request('POST','/v1/appScreenshotSets',{'data':{'type':'appScreenshotSets','attributes':{'screenshotDisplayType':'APP_IPHONE_67'},'relationships':{'appStoreVersionLocalization':rel('appStoreVersionLocalizations',lid)}}})['data']
sid=sett['id']
screens=items(f'/v1/appScreenshotSets/{sid}/appScreenshots')
name=SHOT.name
shot=next((x for x in screens if x['attributes']['fileName']==name),None)
if not shot:
    raw=SHOT.read_bytes()
    shot=request('POST','/v1/appScreenshots',{'data':{'type':'appScreenshots','attributes':{'fileName':name,'fileSize':len(raw)},'relationships':{'appScreenshotSet':rel('appScreenshotSets',sid)}}})['data']
    for op in shot['attributes']['uploadOperations']:
        assert op['method']=='PUT'
        headers={h['name']:h['value'] for h in op['requestHeaders']}
        chunk=raw[op['offset']:op['offset']+op['length']]
        with urllib.request.urlopen(urllib.request.Request(op['url'],data=chunk,method='PUT',headers=headers),timeout=120) as resp:
            assert 200<=resp.status<300
    shot=request('PATCH',f"/v1/appScreenshots/{shot['id']}",{'data':{'type':'appScreenshots','id':shot['id'],'attributes':{'uploaded':True,'sourceFileChecksum':hashlib.md5(raw).hexdigest()}}})['data']
    print('Screenshot uploaded',shot['id'])
else:
    print('Screenshot already reserved',shot['id'])
shots=items(f'/v1/appScreenshotSets/{sid}/appScreenshots')
assert any(x['id']==shot['id'] for x in shots)
builds=items(f'/v1/builds?filter[app]={APP}&filter[version]=7')
b=next(x for x in builds if x['attributes']['version']=='7' and x['attributes']['processingState']=='VALID')
current=request('GET',f'/v1/appStoreVersions/{vid}/build').get('data')
if not current or current['id']!=b['id']:
    request('PATCH',f'/v1/appStoreVersions/{vid}/relationships/build',rel('builds',b['id']))
    print('Attached build 7',b['id'])
else:
    print('Build 7 already attached',b['id'])
# Confirm exact readback.
actual=request('GET',f'/v1/appStoreVersions/{vid}/build')['data']
assert actual['id']==b['id']
actual_shot=request('GET',f"/v1/appScreenshots/{shot['id']}")['data']
print('READBACK',json.dumps({'version':vid,'state':version['attributes']['appStoreState'],'build':actual['id'],'buildNumber':actual['attributes']['version'],'screenshot':actual_shot['id'],'delivery':actual_shot['attributes'].get('assetDeliveryState'),'localization':lid,'marketingUrl':request('GET',f'/v1/appStoreVersionLocalizations/{lid}')['data']['attributes']['marketingUrl']}))
