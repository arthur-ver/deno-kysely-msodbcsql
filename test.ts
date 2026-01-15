import { Generated, Kysely, sql } from "@kysely/kysely";
import { MssqlOdbcDialect } from "./mod.ts";
import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";

interface TestTable {
  id: Generated<number>;
  col_bit: boolean | null;
  col_int: number | null;
  col_bigint: bigint | null;
  col_float: number | null;
  col_string: string | null;
  col_date: Date | null;
  col_binary: Uint8Array | null;
  col_smallint: number | null;
  col_tinyint: number | null;
  col_decimal: string | null;
  long_str: string | null;
  long_bin: Uint8Array | null;
}

interface Database {
  test_table: TestTable;
}

const TABLE_NAME = "test_table";
const maxPoolSize = 5;
const sleepMs = 500;

const inputDate = new Date();
const inputBoolean = true;
const inputInt = 2147483647;
const inputFloat = 123.456;
const inputBigInt = 9007199254740991n;
const inputBinary = new Uint8Array([1, 2, 3, 255]);
const inputString = "Deno 🦕 + SQL Server";
const inputSmallInt = 32000;
const inputTinyInt = 255;
const inputDecimal = "9999.99";

let db: Kysely<Database>;

Deno.test.beforeAll(async () => {
  console.log("Setting up test database...");
  db = new Kysely<Database>({
    dialect: new MssqlOdbcDialect({
      tarn: {
        options: {
          min: 0,
          max: maxPoolSize,
          propagateCreateError: true,
        },
      },
      odbc: {
        libPath: Deno.env.get("MSODBC_LIB")!,
        connString: [
          "driver={ODBC Driver 18 for SQL Server}",
          "server=127.0.0.1",
          "uid=sa",
          "pwd=Test1234$",
          "encrypt=yes",
          "trustServerCertificate=yes",
        ].join(";"),
      },
    }),
  });

  await db.schema.dropTable(TABLE_NAME).ifExists().execute();

  await db.schema.createTable(TABLE_NAME)
    .addColumn("id", "integer", (col) => col.identity().primaryKey())
    .addColumn("col_bit", sql`bit`)
    .addColumn("col_int", "integer")
    .addColumn("col_bigint", "bigint")
    .addColumn("col_float", sql`float`)
    .addColumn("col_string", sql`nvarchar(255)`)
    .addColumn("col_date", sql`datetime2`)
    .addColumn("col_binary", sql`varbinary(max)`)
    .addColumn("col_smallint", "smallint")
    .addColumn("col_tinyint", sql`tinyint`)
    .addColumn("col_decimal", "decimal(10, 2)")
    .addColumn("long_str", sql`nvarchar(max)`)
    .addColumn("long_bin", sql`varbinary(max)`)
    .execute();

  await db
    .insertInto(TABLE_NAME)
    .values({
      col_bit: inputBoolean,
      col_int: inputInt,
      col_bigint: inputBigInt,
      col_float: inputFloat,
      col_string: inputString,
      col_date: inputDate,
      col_binary: inputBinary,
      col_smallint: inputSmallInt,
      col_tinyint: inputTinyInt,
      col_decimal: inputDecimal,
    })
    .execute();
});

Deno.test("➤ CONNECTION POOL", async (t) => {
  /**
   * Verifies that the pool can successfully open (or reuse) connections simultaneously.
   */
  await t.step("simultaneous connections", async () => {
    const uniqueSessions = new Set<number>();

    await Promise.all(
      Array.from({ length: maxPoolSize }).map(async () => {
        await db.transaction().execute(async (trx) => {
          const { rows } = await sql<{ spid: number }>`SELECT @@SPID as spid`
            .execute(trx);

          uniqueSessions.add(rows[0].spid);
          await new Promise((r) => setTimeout(r, sleepMs));
        });
      }),
    );

    assertEquals(
      uniqueSessions.size,
      5,
      `Expected 5 unique sessions, but got ${uniqueSessions.size}. SPIDs: ${
        [...uniqueSessions].join(",")
      }`,
    );
  });

  /**
   * Verifies that the pool enforces the `max` connection limit by queuing excess requests.
   */
  await t.step("max connection enforcement", async () => {
    const requests = 15;
    const buffer = 50;

    // Theoretical minimum if queuing works perfectly:
    const minExpectedDuration = Math.ceil(requests / maxPoolSize) * sleepMs;
    const start = performance.now();

    await Promise.all(
      Array.from({ length: requests }).map(async () => {
        const delayString = `00:00:00.${sleepMs}`;
        await sql`WAITFOR DELAY ${delayString}; SELECT 1`.execute(db);
      }),
    );

    const duration = performance.now() - start;

    assertEquals(
      duration > (minExpectedDuration - buffer),
      true,
      `Pool failed to queue! Expected >${minExpectedDuration}ms (3 batches), but finished in ${duration}ms`,
    );
  });

  /**
   * Verifies that the pool cleans up connection state (specifically Isolation Level) upon release.
   */
  await t.step("state cleanup on connection release", async () => {
    await Promise.all(
      Array.from({ length: maxPoolSize }).map(async () => {
        await db
          .transaction()
          .setIsolationLevel("serializable")
          .execute(async (trx) => {
            const delayString = `00:00:00.${sleepMs}`;
            await sql`WAITFOR DELAY ${delayString}; SELECT 1`.execute(trx);
          });
      }),
    );

    const { rows } = await sql<{ level: number }>`
        SELECT transaction_isolation_level as level
        FROM sys.dm_exec_sessions 
        WHERE session_id = @@SPID
      `.execute(db);

    assertEquals(
      rows[0]?.level,
      2,
      "A recycled connection retained 'Serializable' (4) state instead of resetting to 'ReadCommitted' (2).",
    );
  });
});

Deno.test("➤ TRANSACTIONS", async (t) => {
  /**
   * Verifies that data persists after a successful transaction.
   */
  await t.step("successful commit", async () => {
    const col_string = "ACID Commit Test";

    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto(TABLE_NAME)
        .values({
          col_string,
        })
        .execute();
    });

    const result = await db
      .selectFrom(TABLE_NAME)
      .where("col_string", "=", col_string)
      .select("col_string")
      .executeTakeFirst();

    assertEquals(
      result?.col_string,
      col_string,
      "Data should exist after commit.",
    );
  });

  /**
   * Verifies that data is reverted when an error occurs.
   */
  await t.step("rollback on failure", async () => {
    const col_string = "ACID Rollback Test";

    await assertRejects(
      async () => {
        await db.transaction().execute(async (trx) => {
          await trx
            .insertInto(TABLE_NAME)
            .values({
              col_string,
            })
            .execute();

          throw new Error("Trigger Rollback");
        });
      },
      Error,
      "Trigger Rollback",
    );

    const result = await db
      .selectFrom(TABLE_NAME)
      .where("col_string", "=", col_string)
      .select("col_string")
      .executeTakeFirst();

    assertEquals(result, undefined, "Data should NOT exist after rollback.");
  });

  /**
   * Verifies that rolling back to a savepoint is working.
   */
  await t.step("partial rollback using a savepoint", async () => {
    const firstInsertString = "First Insert";
    const secondInsertString = "Second Insert";
    const thirdInsertString = "Third Insert";

    const trx = await db.startTransaction().execute();

    // First Insert
    await trx
      .insertInto(TABLE_NAME)
      .values({
        col_string: firstInsertString,
      })
      .executeTakeFirstOrThrow();

    // New Savepoint
    const trxAfterFirstInsert = await trx.savepoint("after_first_insert")
      .execute();

    // Second Insert (Simulated Error)
    try {
      await trxAfterFirstInsert
        .insertInto(TABLE_NAME)
        .values({
          col_string: secondInsertString,
        })
        .executeTakeFirstOrThrow();

      throw new Error("Simulated Error");
    } catch (_error) {
      await trxAfterFirstInsert.rollbackToSavepoint("after_first_insert")
        .execute();
    }

    // Third Insert
    await trx
      .insertInto(TABLE_NAME)
      .values({
        col_string: thirdInsertString,
      })
      .execute();

    await trx.commit().execute();

    const rows = await db
      .selectFrom(TABLE_NAME)
      .where("col_string", "in", [
        firstInsertString,
        secondInsertString,
        thirdInsertString,
      ])
      .select(["col_string"])
      .execute();

    const hasSecond = rows.some((r) => r.col_string === secondInsertString);

    assertEquals(
      hasSecond,
      false,
      `"${secondInsertString}" should NOT exist (Rolled back).`,
    );
  });
});

Deno.test("➤ DATA TYPES", async (t) => {
  const fetchedRow = await db
    .selectFrom(TABLE_NAME)
    .selectAll()
    .executeTakeFirstOrThrow();

  await t.step("BIT", () => {
    assertEquals(typeof fetchedRow.col_bit, "boolean");
    assertEquals(fetchedRow.col_bit, inputBoolean);
  });

  await t.step("INT", () => {
    assertEquals(typeof fetchedRow.col_int, "number");
    assertEquals(fetchedRow.col_int, inputInt);
  });

  await t.step("BIGINT", () => {
    assertEquals(typeof fetchedRow.col_bigint, "bigint");
    assertEquals(fetchedRow.col_bigint, inputBigInt);
  });

  await t.step("FLOAT", () => {
    assertEquals(typeof fetchedRow.col_float, "number");
    assertEquals(fetchedRow.col_float, inputFloat);
  });

  await t.step("NVARCHAR", () => {
    assertEquals(typeof fetchedRow.col_string, "string");
    assertEquals(fetchedRow.col_string, inputString);
  });

  await t.step("DATETIME2", () => {
    const rawString = fetchedRow.col_date as unknown as string;
    const retrievedTime = new Date(rawString.replace(" ", "T") + "Z").getTime();
    if (isNaN(retrievedTime)) {
      throw new Error(`Driver returned unparseable date: "${rawString}"`);
    }
    assertEquals(retrievedTime, inputDate.getTime());
  });

  await t.step("VARBINARY", () => {
    assertInstanceOf(fetchedRow.col_binary, Uint8Array);
    assertEquals(fetchedRow.col_binary, inputBinary);
  });

  await t.step("SMALLINT", () => {
    assertEquals(typeof fetchedRow.col_smallint, "number");
    assertEquals(fetchedRow.col_smallint, inputSmallInt);
  });

  await t.step("TINYINT", () => {
    assertEquals(typeof fetchedRow.col_tinyint, "number");
    assertEquals(fetchedRow.col_tinyint, inputTinyInt);
  });

  await t.step("DECIMAL", () => {
    assertEquals(typeof fetchedRow.col_decimal, "string");
    assertEquals(fetchedRow.col_decimal, inputDecimal);
  });
});

Deno.test("➤ LARGE DATA (Truncation Handling)", async (t) => {
  const longString = "A".repeat(100_000) + "END";
  const longBinary = new Uint8Array(100_000).fill(0xA);
  longBinary[longBinary.length - 1] = 0xB; // Marker at the end

  await db.deleteFrom(TABLE_NAME).execute();

  await t.step("insert large data", async () => {
    await db.insertInto(TABLE_NAME)
      .values({
        long_str: longString,
        long_bin: longBinary,
      })
      .execute();
  });

  await t.step("fetch and verify large string (NVARCHAR MAX)", async () => {
    const row = await db.selectFrom(TABLE_NAME)
      .select("long_str")
      .executeTakeFirstOrThrow();

    assertEquals(row.long_str, longString);
  });

  await t.step("fetch and verify large binary (VARBINARY MAX)", async () => {
    const row = await db.selectFrom(TABLE_NAME)
      .select("long_bin")
      .executeTakeFirstOrThrow();

    assertEquals(row.long_bin, longBinary);
  });
});

Deno.test.afterAll(async () => {
  console.log("Tearing down test database...");
  await sql`DROP TABLE ${sql.table(TABLE_NAME)}`.execute(db);
  await db.destroy();
});
