import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {bannerTemplates,resolveBanner} from '../lib/banners.js';
import {database} from '../lib/db.js';
import {dispatch} from '../lib/service.js';
import {createSession,digest} from '../lib/auth.js';

test('banner templates are bundled, validated, and persisted on event creation',async()=>{
  const sql=database();let id,token;
  try {
    assert.equal(bannerTemplates.length,6);
    assert.equal(new Set(bannerTemplates.map(t=>t.id)).size,6);
    for(const t of bannerTemplates)await access(new URL('../public'+t.image,import.meta.url));
    assert.equal(resolveBanner().id,'bloom');
    assert.equal(resolveBanner('untrusted'),undefined);
    const [admin]=await sql`SELECT id FROM users WHERE email=${process.env.ADMIN_EMAIL} AND role='admin'`;
    token=await createSession(admin.id);
    const post=body=>dispatch(new Request('http://seatwise.test/api/admin/events',{method:'POST',headers:{cookie:'sw_session='+token,'Content-Type':'application/json'},body:JSON.stringify(body)}));
    const body={title:'Banner integration verification',date:'2027-12-31T18:00:00+05:30',basePrice:799,bannerTemplate:'theatre'};
    const bad=await post({...body,bannerTemplate:'https://untrusted.example/banner.jpg'});
    assert.equal(bad.status,400);
    const result=await post(body);const data=await result.json();id=data.id;
    assert.equal(result.status,201,JSON.stringify(data));
    const [event]=await sql`SELECT details FROM events WHERE id=${id}`;
    assert.equal(event.details.image,'/images/theatre.jpg');
    assert.equal(event.details.bannerTemplate,'theatre');
    const publicResponse=await dispatch(new Request('http://seatwise.test/api/events/'+id));
    assert.equal((await publicResponse.json()).image,'/images/theatre.jpg');
  }finally{
    if(id)await sql.begin(async tx=>{await tx`DELETE FROM activity WHERE event_id=${id}`;await tx`DELETE FROM seats WHERE event_id=${id}`;await tx`DELETE FROM classes WHERE event_id=${id}`;await tx`DELETE FROM events WHERE id=${id}`;});
    if(token)await sql`DELETE FROM sessions WHERE digest=${digest(token)}`;
    await sql.end();
  }
});
