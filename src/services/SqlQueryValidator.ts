import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Parser } = require("node-sql-parser") as typeof import("node-sql-parser");

const DATABASE = "sentient_log";
const TABLE = "events";
const LIMIT = 100;

type SqlAst = Record<string, unknown>;

/** Validates the SQL structure independently of the model prompt. */
export class SqlQueryValidator {
  private readonly parser = new Parser();

  validateAndNormalize(sql: string): string {
    let parsed: unknown;
    const adapted = this.adaptClickHouseSyntax(sql.trim());
    try {
      // PostgreSQL grammar accepts standard aggregate syntax such as count().
      // ClickHouse remains the execution engine and its reader user is
      // database read-only.
      parsed = this.parser.astify(adapted.sql, { database: "Postgresql" });
    } catch {
      throw new Error("Generated query is not valid single-statement SQL");
    }

    if (Array.isArray(parsed) || !parsed || typeof parsed !== "object") {
      throw new Error("Generated query must contain exactly one statement");
    }

    const ast = parsed as SqlAst;
    this.validateSelect(ast);
    this.enforceLimit(ast);
    return adapted.restore(this.parser.sqlify(ast as never, { database: "Postgresql" }));
  }

  /**
   * node-sql-parser does not understand ClickHouse's parametric aggregate
   * syntax (for example, quantile(0.99)(latency_ms)). Represent those calls
   * as ordinary functions while building the AST, then restore valid
   * ClickHouse syntax after structural validation.
   */
  private adaptClickHouseSyntax(sql: string): { sql: string; restore: (value: string) => string } {
    const replacements: Array<{ placeholder: string; name: string; parameters: string }> = [];
    const parserSql = sql.replace(
      /\b(quantile(?:Exact|TDigest)?)(\([^()]+\))\(([^()]+)\)/gi,
      (_match, name: string, parameters: string, argument: string) => {
        const placeholder = `sentient_parametric_aggregate_${replacements.length}`;
        replacements.push({ placeholder, name, parameters });
        return `${placeholder}(${argument})`;
      },
    );

    return {
      sql: parserSql,
      restore: (value: string) => replacements.reduce(
        (restored, replacement) => restored.replace(
          new RegExp(`\\b${replacement.placeholder}\\(([^)]*)\\)`, "i"),
          `${replacement.name}${replacement.parameters}($1)`,
        ),
        value,
      ),
    };
  }

  private validateSelect(ast: SqlAst): void {
    if (ast.type !== "select") {
      throw new Error("Only SELECT statements and SELECT CTEs are allowed");
    }

    const cteNames = new Set<string>();
    const withClauses = ast.with;
    if (Array.isArray(withClauses)) {
      for (const cte of withClauses) {
        if (!this.isRecord(cte) || !this.isRecord(cte.name) || typeof cte.name.value !== "string") {
          throw new Error("Generated query contains an invalid CTE");
        }
        cteNames.add(cte.name.value.toLowerCase());
      }
      for (const cte of withClauses) this.validateSelect(this.getCteAst(cte));
    }

    this.validateFrom(ast.from, cteNames);
    this.validateNestedSelects(ast, new Set(["with", "from"]));
  }

  private validateFrom(from: unknown, cteNames: Set<string>): void {
    if (!Array.isArray(from)) return;
    for (const source of from) {
      if (!this.isRecord(source)) throw new Error("Generated query contains an invalid FROM clause");
      if (typeof source.table === "string") {
        const table = source.table.toLowerCase();
        const database = typeof source.db === "string" ? source.db.toLowerCase() : null;
        if (cteNames.has(table) && database === null) continue;
        if (table !== TABLE || (database !== null && database !== DATABASE)) {
          throw new Error("Generated query may only read sentient_log.events");
        }
        continue;
      }
      if (this.isRecord(source.expr) && this.isRecord(source.expr.ast)) {
        this.validateSelect(source.expr.ast);
        continue;
      }
      if (source.type !== "dual") {
        throw new Error("Generated query contains an unsupported FROM source");
      }
    }
  }

  private validateNestedSelects(value: unknown, skippedKeys: Set<string>): void {
    if (Array.isArray(value)) {
      for (const item of value) this.validateNestedSelects(item, skippedKeys);
      return;
    }
    if (!this.isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (skippedKeys.has(key)) continue;
      if (this.isRecord(child) && child.type === "select") this.validateSelect(child);
      else this.validateNestedSelects(child, skippedKeys);
    }
  }

  private enforceLimit(ast: SqlAst): void {
    ast.limit = {
      seperator: "",
      value: [{ type: "number", value: LIMIT }],
    };
  }

  private getCteAst(cte: unknown): SqlAst {
    if (!this.isRecord(cte) || !this.isRecord(cte.stmt)) {
      throw new Error("Generated query contains an invalid CTE");
    }
    if (this.isRecord(cte.stmt.ast)) return cte.stmt.ast;
    if (cte.stmt.type === "select") return cte.stmt;
    throw new Error("Generated query contains an invalid CTE");
  }

  private isRecord(value: unknown): value is SqlAst {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
