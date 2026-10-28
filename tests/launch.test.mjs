import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { database } from '../lib/db.js';
import { digest, hashPassword } from '../lib/auth.js';
import { dispatch } from '../lib/service.js';

const sql = database(), ids = [], userIds = [];
const req = async (path, user, body) => {
  const request = new Request((process.env.TEST_BASE_URL || 'http://seatwise.test') + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST', headers: {
      ...(user ? { cookie: user.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const r = process.env.TEST_BASE_URL ? await fetch(request) : await dispatch(request);
  return { status: r.status, data: await r.json() };
};
async function fixture(name, opens) {
  const id = 'test-launch-' + name + '-' + randomUUID().slice(0, 8); ids.push(id);
  const details = { date: new Date(Date.now() + 86400000).toISOString(), salesOpenAt: opens, isTest: true };
  await sql`INSERT INTO events(id,title,details) VALUES(${id},${'Launch test ' + name},${sql.json(details)})`;
  await sql`INSERT INTO classes(event_id,id,name,price,details) VALUES(${id},'silver','Silver',1000,'{}')`;
  for (let i = 1; i <= 2; i++) await sql`INSERT INTO seats(event_id,id,class_id,row_label,number,x,y,rotation) VALUES(${id},${'S' + i},'silver','S',${i},0,0,0)`;
  return id;
}

test('scheduled launch: timing, FIFO batches, access control and public opening', async t => {
  try {
    const fans = Array.from({ length: 207 }, () => {
      const id = randomUUID(), token = randomBytes(32).toString('base64url'); userIds.push(id);
      return { id, cookie: 'sw_session=' + token, token };
    });
    const hash = hashPassword('Launch-test-only-password');
    await sql`INSERT INTO users ${sql(fans.map(u => ({ id: u.id, name: 'Launch test fan', email: `launch-${u.id}@seatwise.invalid`, password_hash: hash, wallet: 10000 })))}`;
    await sql`INSERT INTO sessions ${sql(fans.map(u => ({ digest: digest(u.token), user_id: u.id, expires_at: new Date(Date.now() + 3600000) })))}`;
    const event = await fixture('batches', new Date(Date.now() + 600000).toISOString());
    const path = '/events/' + event;
    const count = async () => (await sql`SELECT count(*)::int AS count FROM launch_entries WHERE event_id=${event} AND admitted_at IS NOT NULL`)[0].count;

    await t.test('waiting room opens only 30 minutes before sales; direct booking/holds cannot bypass it', async () => {
      const early = await fixture('early', new Date(Date.now() + 3600000).toISOString());
      assert.equal((await req('/events/' + early, fans[0])).data.launch.phase, 'scheduled');
      assert.equal((await req('/events/' + early + '/launch', fans[0], {})).data.code, 'ROOM_NOT_OPEN');
      assert.equal((await req(path + '/join', fans[0], { classId: 'silver', quantity: 1 })).data.code, 'LAUNCH_WAIT');
      assert.equal((await req(path + '/hold', fans[0], { mode: 'auto' })).data.code, 'LAUNCH_WAIT');
      assert.equal((await req(path + '/launch', null, {})).status, 401);
    });
    await t.test('concurrent joins assign unique FIFO numbers; retries and another session retain position', async () => {
      const results = await Promise.all(fans.slice(0, 12).map(fan => req(path + '/launch', fan, {})));
      assert.ok(results.every(r => r.status === 200), JSON.stringify(results.filter(r => r.status !== 200)));
      assert.deepEqual(results.map(r => r.data.launch.entry.queueNumber).sort((a,b)=>a-b), Array.from({length:12},(_,i)=>i+1));
      const retry = await req(path + '/launch', fans[0], {});
      assert.equal(retry.data.launch.entry.queueNumber, results[0].data.launch.entry.queueNumber);
      assert.equal(retry.data.launch.phase, 'waiting_room');
      assert.equal(retry.data.launch.canBook, false);
      assert.equal(await count(), 0);
      assert.equal((await req(path)).data.launch.entry, null);
      // Add a large isolated backlog without issuing hundreds of HTTP requests.
      await sql`INSERT INTO launch_entries ${sql(fans.slice(12, 205).map((u,i)=>({event_id:event,user_id:u.id,queue_number:i+13})))}`;
    });
    await t.test('opening releases exactly 100; repeated and concurrent polls cannot release another batch', async () => {
      await sql`UPDATE events SET details=details || ${sql.json({salesOpenAt:new Date(Date.now()-3000).toISOString()})}::jsonb WHERE id=${event}`;
      await Promise.all(Array.from({length:8},()=>req(path)));
      assert.equal(await count(),100);
      const [first] = await sql`SELECT user_id FROM launch_entries WHERE event_id=${event} AND queue_number=1`;
      const admitted = fans.find(u=>u.id===first.user_id);
      assert.equal((await req(path,admitted)).data.launch.canBook,true);
      assert.equal((await req(path+'/join',admitted,{classId:'silver',quantity:1})).data.queue.state,'admitted');
      assert.equal((await req(path+'/join',fans[204],{classId:'silver',quantity:1})).data.code,'LAUNCH_WAIT');
      assert.equal((await req(path, fans[204])).data.launch.entry.position,105);
      const newcomer=await req(path+'/launch',fans[205],{});
      assert.equal(newcomer.data.launch.entry.queueNumber,206);
      assert.equal(newcomer.data.launch.entry.position,106);
      assert.equal(await count(),100);
    });
    await t.test('next five-minute slot releases the next 100, without accumulating missed slots', async () => {
      await sql`UPDATE events SET details=details || ${sql.json({salesOpenAt:new Date(Date.now()-3720000).toISOString(),launchNextBatchAt:new Date(Date.now()-1000).toISOString()})}::jsonb WHERE id=${event}`;
      const res=await req(path,fans[204]);
      assert.equal(await count(),200);
      assert.equal(res.data.launch.entry.position,5);
      assert.equal(res.data.launch.waiting,6);
      assert.equal(res.data.launch.phase,'releasing');
      await req(path); assert.equal(await count(),200);
    });
    await t.test('last partial batch drains the queue and opens public booking without bypassing class capacity', async () => {
      await sql`UPDATE events SET details=details || ${sql.json({launchNextBatchAt:new Date(Date.now()-1000).toISOString()})}::jsonb WHERE id=${event}`;
      const res=await req(path);
      assert.equal(await count(),206);
      assert.equal(res.data.launch.phase,'open');
      assert.equal(res.data.launch.waiting,0);
      assert.equal(res.data.launch.canBook,true);
      const joined=await req(path+'/join',fans[206],{classId:'silver',quantity:2});
      assert.equal(joined.data.queue.state,'waiting'); // One seat already promised above.
      const logs=await sql`SELECT details FROM activity WHERE event_id=${event} AND kind='launch_batch' ORDER BY id`;
      assert.deepEqual(logs.map(l=>l.details.admitted),[100,100,6]);
    });
    await t.test('a sale with no launch waitlist opens immediately; legacy events remain open', async () => {
      const empty=await fixture('empty',new Date(Date.now()-1000).toISOString());
      const legacy=await fixture('legacy',null);
      for(const id of [empty,legacy]) assert.equal((await req('/events/'+id)).data.launch.canBook,true);
    });
    await t.test('only admin can schedule, and release must be before showtime and in the future', async () => {
      const adminId=fans[0].id;
      await sql`UPDATE users SET role='admin' WHERE id=${adminId}`;
      const body={title:'Scheduled integration event',date:new Date(Date.now()+86400000).toISOString(),basePrice:799,salesOpenAt:new Date(Date.now()+600000).toISOString()};
      assert.equal((await req('/admin/events',fans[1],body)).status,403);
      for(const date of ['invalid',new Date(Date.now()-1000).toISOString(),new Date(Date.now()+172800000).toISOString()])
        assert.equal((await req('/admin/events',fans[0],{...body,salesOpenAt:date})).status,400);
      const result=await req('/admin/events',fans[0],body);
      assert.equal(result.status,201,JSON.stringify(result)); ids.push(result.data.id);
      const [stored]=await sql`SELECT details FROM events WHERE id=${result.data.id}`;
      assert.equal(stored.details.salesOpenAt,body.salesOpenAt);
    });
  } finally {
    for(const id of ids) await sql.begin(async tx=>{
      await tx`DELETE FROM activity WHERE event_id=${id}`;
      await tx`DELETE FROM launch_entries WHERE event_id=${id}`;
      await tx`DELETE FROM queue_entries WHERE event_id=${id}`;
      await tx`DELETE FROM seats WHERE event_id=${id}`;
      await tx`DELETE FROM classes WHERE event_id=${id}`;
      await tx`DELETE FROM events WHERE id=${id}`;
    });
    if(userIds.length){await sql`DELETE FROM sessions WHERE user_id IN ${sql(userIds)}`;await sql`DELETE FROM users WHERE id IN ${sql(userIds)}`;}
    await sql.end();
  }
});
