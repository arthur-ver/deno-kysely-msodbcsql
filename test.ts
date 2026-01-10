import { Generated, Kysely, sql } from "@kysely/kysely";
import { MssqlOdbcDialect } from "./mod.ts";
import { assertEquals, assertInstanceOf } from "@std/assert";

interface TestTable {
  id: Generated<number>;
  col_bit: boolean;
  col_int: number;
  col_bigint: bigint;
  col_float: number;
  col_string: string;
  col_date: Date;
  col_binary: Uint8Array;
  col_smallint: number;
  col_tinyint: number;
  col_decimal: string;
}

interface Database {
  type_test: TestTable;
}

const TABLE_NAME = "type_test";
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
let fetchedRow: TestTable;

Deno.test.beforeAll(async () => {
  console.log("Setting up test database...");
  db = new Kysely<Database>({
    dialect: new MssqlOdbcDialect({
      tarn: {
        options: {
          min: 0,
          max: 10,
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

  await sql`IF OBJECT_ID(${TABLE_NAME}, 'U') IS NOT NULL DROP TABLE ${
    sql.table(TABLE_NAME)
  }`.execute(db);

  await sql`
      CREATE TABLE ${sql.table(TABLE_NAME)} (
        id INT IDENTITY(1,1) PRIMARY KEY,
        col_bit BIT,
        col_int INT,
        col_bigint BIGINT,
        col_float FLOAT,
        col_string NVARCHAR(255),
        col_date DATETIME2,
        col_binary VARBINARY(MAX),
        col_smallint SMALLINT,
        col_tinyint TINYINT,
        col_decimal DECIMAL(10, 2)
      )
    `.execute(db);

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

  const result = await db
    .selectFrom(TABLE_NAME)
    .selectAll()
    .executeTakeFirstOrThrow();

  fetchedRow = result as unknown as TestTable;
});

Deno.test("Data Types", async (t) => {
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
    const isoString = rawString.replace(" ", "T") + "Z";
    const retrievedTime = new Date(isoString).getTime();
    if (isNaN(retrievedTime)) {
      throw new Error(
        `Driver returned unparseable date format: "${rawString}"`,
      );
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

Deno.test.afterAll(async () => {
  console.log("Tearing down test database...");
  await sql`DROP TABLE ${sql.table(TABLE_NAME)}`.execute(db);
  await db.destroy();
});
