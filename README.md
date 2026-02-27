# deno-kysely-msodbcsql

> This **MSSQL Kysely Driver for Deno** binds to the native **Microsoft ODBC
> Driver for SQL Server** using Deno FFI.

[![JSR](https://jsr.io/badges/@arthur-ver/deno-kysely-msodbcsql)](https://jsr.io/@arthur-ver/deno-kysely-msodbcsql)

## Prerequisites

> [!IMPORTANT]
> **System Requirement:** You must have the
> [Microsoft ODBC Driver for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)
> installed on your OS.

> [!IMPORTANT]
> **Deno Permission:** The `--allow-ffi` flag is required.

## Installation

```console
deno add jsr:@kysely/kysely jsr:@arthur-ver/deno-kysely-msodbcsql
```

## Usage

```ts
import { Kysely } from "@kysely/kysely";
import { MssqlOdbcDialect } from "@arthur-ver/deno-kysely-msodbcsql";

const db = new Kysely<Database>({
  dialect: new MssqlOdbcDialect({
    tarn: {
      options: {
        min: 0,
        max: 10,
      },
    },
    odbc: {
      libPath: "/opt/homebrew/lib/libmsodbcsql.18.dylib",
      connString: [
        "driver={ODBC Driver 18 for SQL Server}",
        "server=<host>",
        "database=<db>",
        "uid=<username>",
        "pwd=<password>",
        "encrypt=yes",
        "trustServerCertificate=yes",
      ].join(";"),
    },
  }),
});
```

## Supported Data Types

### Deno → SQL

| Deno                                 | ODBC C Type                    | ODBC SQL Type       | Notes                                                     |
| :----------------------------------- | :----------------------------- | :------------------ | :-------------------------------------------------------- |
| **`null` / `undefined`**             | -                              | `NULL`              | -                                                         |
| **`boolean`**                        | `SQL_C_BIT`                    | `BIT`               | -                                                         |
| **`number`**                         | `SQL_C_SLONG` / `SQL_C_DOUBLE` | `INTEGER` / `FLOAT` | Mapped automatically between integer and float.           |
| **`bigint`**                         | `SQL_C_SBIGINT`                | `BIGINT`            | -                                                         |
| **`string`**                         | `SQL_C_WCHAR`                  | `WVARCHAR`          | In JS strings are encoded in UTF-16. Supports large data. |
| **`Uint8Array` / `ArrayBufferView`** | `SQL_C_BINARY`                 | `VARBINARY`         | Supports large data.                                      |
| **`Date`**                           | `SQL_C_TYPE_TIMESTAMP`         | `TYPE_TIMESTAMP`    | -                                                         |

### SQL → Deno

| ODBC SQL Type                                                                       | ODBC C Type                                                        | Deno         | Notes                                                     |
| :---------------------------------------------------------------------------------- | :----------------------------------------------------------------- | :----------- | :-------------------------------------------------------- |
| **`NULL`**                                                                          | -                                                                  | `null`       | -                                                         |
| **`BIT`**                                                                           | `SQL_C_BIT`                                                        | `boolean`    | -                                                         |
| **`INTEGER`** / **`FLOAT`** / **`SMALLINT`** / **`TINYINT`**                        | `SQL_C_SLONG` / `SQL_C_DOUBLE` / `SQL_C_SSHORT` / `SQL_C_UTINYINT` | `number`     | -                                                         |
| **`BIGINT`**                                                                        | `SQL_C_SBIGINT`                                                    | `bigint`     | -                                                         |
| **`NUMERIC`, `SQL_DECIMAL`**                                                        | `SQL_C_WCHAR`                                                      | `string`     | Fetched as strings to avoid precision loss.               |
| **`CHAR`, `VARCHAR`, `LONGVARCHAR`**<br>**`SQL_WCHAR`, `WVARCHAR`, `WLONGVARCHAR`** | `SQL_C_WCHAR`                                                      | `string`     | In JS strings are encoded in UTF-16. Supports large data. |
| **`BINARY`, `VARBINARY`, `LONGVARBINARY`**                                          | `SQL_C_BINARY`                                                     | `Uint8Array` | Supports large data.                                      |
| **`TYPE_DATE`, `TIMESTAMP`**                                                        | `SQL_C_WCHAR`                                                      | `Date`       | -                                                         |
