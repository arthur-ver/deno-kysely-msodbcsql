# 🚧 deno-kysely-msodbc (WIP)

> **Native MSSQL support for Kysely on Deno:** Bypass Node.js compatibility layers by binding directly to the Microsoft ODBC Driver via Deno FFI.

![Deno](https://img.shields.io/badge/deno-000000?style=for-the-badge&logo=deno&logoColor=white) ![WIP](https://img.shields.io/badge/Status-WIP-orange?style=for-the-badge)

## 💡 Why?
Currently, connecting Deno to MSSQL requires relying on Deno's Node.js compatibility layer to run libraries like `npm:mssql` or `npm:tedious`. These libraries offer no official support for Deno and frequently suffer from unresolved compatibility issues. While the Deno ecosystem is maturing, native MSSQL support remains a missing piece.

**This project takes a different approach.**

Instead of using Node.js libraries, we leverage **Deno FFI (Foreign Function Interface)** to talk directly to the OS-level **Microsoft ODBC Driver**. This results in a "pure" Deno implementation that interacts with the database at the C-level.

### Architecture

```mermaid
flowchart LR
    Kysely[Kysely Query Builder] <--> Dialect[This Dialect]
    Dialect <-->|Deno FFI| ODBC[libmsodbcsql.so]
    ODBC <-->|TCP/IP| SQLServer[(SQL Server)]
    
    subgraph "No Node.js Dependencies"
        Dialect
    end
