// Verify fresh installs and repeat setup in an isolated schema, then roll it all
// back. No production tables or records are changed by this check.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { database } from '../lib/db.js';
if(process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL=process.env.DATABASE_URL_UNPOOLED;
const sql=database(), rollback=new Error('schema-check-rollback');
try {
  const schema=await readFile(new URL('../lib/schema.sql',import.meta.url),'utf8');
  try { await sql.begin(async tx=>{
    const name='schema_check_'+randomUUID().replaceAll('-','');
    await tx.unsafe(`CREATE SCHEMA "${name}"; SET LOCAL search_path TO "${name}"`);
    await tx.unsafe(schema); await tx.unsafe(schema);
    const [r]=await tx`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=${name} AND table_name='launch_entries'`;
    if(r.count!==1)throw new Error('Launch queue table missing');
    throw rollback;
  }); } catch(e){if(e!==rollback)throw e;}
  console.log('Fresh schema and repeated setup verified in a rolled-back isolated schema.');
}finally{await sql.end();}
