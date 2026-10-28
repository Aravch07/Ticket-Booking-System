import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";

const fragment = Symbol("sql-fragment");
const jsonValue = Symbol("json-value");
const quote = (identifier) =>
  '"' + String(identifier).replaceAll('"', '""') + '"';

// A small parameterised SQL tag. All values become pg bind parameters; helper
// fragments are limited to quoted object keys and parameterised lists/inserts.
// This keeps the SQL at call sites readable while using Vercel's supported pool.
function render(value, values) {
  if (value?.[fragment]) return value[fragment](values);
  if (value?.[jsonValue]) value = JSON.stringify(value.data);
  if (value === undefined) throw new Error("An SQL parameter was undefined.");
  values.push(value);
  return "$" + values.length;
}

function helper(items) {
  if (!Array.isArray(items) || !items.length)
    throw new Error("SQL lists cannot be empty.");
  return {
    [fragment]: (values) => {
      if (
        typeof items[0] === "object" &&
        items[0] !== null &&
        !Array.isArray(items[0])
      ) {
        const columns = Object.keys(items[0]);
        return (
          "(" +
          columns.map(quote).join(",") +
          ") VALUES " +
          items
            .map(
              (row) =>
                "(" +
                columns.map((key) => render(row[key], values)).join(",") +
                ")",
            )
            .join(",")
        );
      }
      return "(" + items.map((value) => render(value, values)).join(",") + ")";
    },
  };
}

function tagFor(executor, pool) {
  function sql(strings, ...args) {
    if (!strings?.raw) return helper(strings);
    const values = [];
    let text = strings[0];
    for (let i = 0; i < args.length; i++)
      text += render(args[i], values) + strings[i + 1];
    return executor.query(text, values).then((result) => result.rows || []);
  }
  sql.json = (data) => ({ [jsonValue]: true, data });
  sql.unsafe = (text) =>
    executor.query(text).then((result) => result.rows || []);
  sql.end = () => pool.end();
  sql.begin = async (options, operation) => {
    if (typeof options === "function") {
      operation = options;
      options = "";
    }
    if (options && !/^[a-z ]+$/i.test(options))
      throw new Error("Invalid transaction options.");
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN " + (options || ""));
      await client.query(
        "SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='12s'; SET LOCAL idle_in_transaction_session_timeout='15s'",
      );
      const result = await operation(tagFor(client, pool));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        broken = true;
      }
      throw error;
    } finally {
      client.release(broken);
    }
  };
  return sql;
}

export function createDatabase(url) {
  // Enforce certificate verification explicitly; do not inherit sslmode=require's
  // permissive legacy behaviour from pg-connection-string.
  const connection = new URL(url);
  connection.searchParams.delete("sslmode");
  const pool = new pg.Pool({
    connectionString: connection.toString(),
    ssl: { rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    query_timeout: 25000,
    keepAlive: true,
    allowExitOnIdle: true,
  });
  pool.on("error", (error) =>
    console.error(
      "SeatWise idle database connection:",
      error.code || "CONNECTION_CLOSED",
    ),
  );
  attachDatabasePool(pool);
  return tagFor(pool, pool);
}
