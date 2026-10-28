import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { database } from '../lib/db.js';
import { hashPassword, digest, createSession } from '../lib/auth.js';
import { dispatch } from '../lib/service.js';
import { prepareVenue, venueLayouts } from '../lib/venue.js';

test('custom venue sections create exact inventory, prices, and bookable tickets', async () => {
  const sql = database(); let eventId, fanId, adminToken, fanToken;
  const call = async (path, token, body) => {
    const request = new Request((process.env.TEST_BASE_URL || 'http://seatwise.test') + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { cookie: 'sw_session=' + token } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = process.env.TEST_BASE_URL ? await fetch(request) : await dispatch(request);
    return { status: res.status, data: await res.json() };
  };
  try {
    const sections = [
      { id:'gold', name:'Center Circle', rows:2, seatsPerRow:10, price:1400 },
      { id:'silver', name:'Upper House', rows:1, seatsPerRow:12, price:600 },
    ];
    for (const layout of venueLayouts) {
      const plan = prepareVenue(layout.id, sections);
      assert.equal(plan.capacity,32); assert.equal(new Set(plan.seats.map(seat=>seat.id)).size,32);
      assert.deepEqual(plan.seats.map(seat=>seat.classId).reduce((counts,id)=>(counts[id]=(counts[id]||0)+1,counts),{}),{gold:20,silver:12});
      assert.ok(plan.seats.every(seat=>seat.x>=0 && seat.x<=840 && seat.y>=0 && seat.y<=480));
    }
    assert.throws(()=>prepareVenue('arena',[{...sections[0],rows:10}]));
    assert.throws(()=>prepareVenue('arena',[sections[0],{...sections[0]}]));
    const [admin]=await sql`SELECT id FROM users WHERE email=${process.env.ADMIN_EMAIL} AND role='admin'`;
    adminToken=await createSession(admin.id);
    const body={title:'Custom venue integration event',date:new Date(Date.now()+86400000).toISOString(),venue:'Indira Hall',venueLayout:'theatre',sections,bannerTemplate:'theatre'};
    for(const invalid of [{...body,venueLayout:'untrusted'},{...body,sections:[{...sections[0],price:0}]},{...body,sections:[]}])
      assert.equal((await call('/admin/events',adminToken,invalid)).status,400);
    const created=await call('/admin/events',adminToken,body);
    assert.equal(created.status,201,JSON.stringify(created.data)); eventId=created.data.id;
    const [stored]=await sql`SELECT details FROM events WHERE id=${eventId}`;
    assert.equal(stored.details.basePrice,600); assert.equal(stored.details.venueLayout,'theatre');
    assert.deepEqual(stored.details.sectionPlan.map(section=>section.id),['gold','silver']);
    const publicEvent=await call('/events/'+eventId);
    assert.equal(publicEvent.data.seats.length,32);
    assert.deepEqual(publicEvent.data.classes.map(cls=>[cls.id,cls.price,cls.capacity]),[['gold',1400,20],['silver',600,12]]);
    assert.equal(publicEvent.data.seats.filter(seat=>seat.classId==='vip').length,0);
    fanId=randomUUID(); fanToken=randomBytes(32).toString('base64url');
    await sql`INSERT INTO users(id,name,email,password_hash,wallet) VALUES(${fanId},'Venue test fan',${`venue-${fanId}@seatwise.invalid`},${hashPassword('Venue-test-password')},5000)`;
    await sql`INSERT INTO sessions(digest,user_id,expires_at) VALUES(${digest(fanToken)},${fanId},now()+interval '1 hour')`;
    assert.equal((await call('/events/'+eventId+'/join',fanToken,{classId:'vip',quantity:1})).status,400);
    const joined=await call('/events/'+eventId+'/join',fanToken,{classId:'gold',quantity:1});
    assert.equal(joined.data.queue.state,'admitted');
    const held=await call('/events/'+eventId+'/hold',fanToken,{mode:'auto'});
    assert.equal(held.data.hold.seats.length,1);
    assert.equal(held.data.hold.seats[0].classId,'gold');
    const paid=await call('/events/'+eventId+'/pay',fanToken,{key:randomUUID(),holdId:held.data.hold.id,outcome:'success'});
    assert.equal(paid.data.ok,true);
    const [booking]=await sql`SELECT total FROM bookings WHERE event_id=${eventId} AND user_id=${fanId}`;
    assert.equal(booking.total,1400);
    const alloc=await call('/admin/inventory',adminToken,{eventId,classId:'silver',quantity:2,reason:'Venue test',action:'reserve'});
    assert.equal(alloc.status,200,JSON.stringify(alloc.data));
    const stats=await call('/admin/stats',adminToken);
    const item=stats.data.events.find(event=>event.id===eventId);
    assert.equal(item.booked,1); assert.equal(item.reserved,2); assert.equal(item.capacity,32);
  } finally {
    if(eventId) await sql.begin(async tx=>{
      await tx`DELETE FROM activity WHERE event_id=${eventId}`;
      await tx`DELETE FROM payments WHERE hold_id IN (SELECT id FROM holds WHERE event_id=${eventId})`;
      await tx`DELETE FROM tickets WHERE event_id=${eventId}`;
      await tx`DELETE FROM queue_entries WHERE event_id=${eventId}`;
      await tx`DELETE FROM seats WHERE event_id=${eventId}`;
      await tx`DELETE FROM bookings WHERE event_id=${eventId}`;
      await tx`DELETE FROM holds WHERE event_id=${eventId}`;
      await tx`DELETE FROM classes WHERE event_id=${eventId}`;
      await tx`DELETE FROM events WHERE id=${eventId}`;
    });
    if(fanId){await sql`DELETE FROM wallet_ledger WHERE user_id=${fanId}`;await sql`DELETE FROM sessions WHERE user_id=${fanId}`;await sql`DELETE FROM users WHERE id=${fanId}`;}
    if(adminToken)await sql`DELETE FROM sessions WHERE digest=${digest(adminToken)}`;
    await sql.end();
  }
});
